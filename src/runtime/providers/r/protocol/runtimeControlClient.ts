import * as fs from "fs";
import * as net from "net";
import {
    encodeRuntimeControlRequest
} from "./runtimeControlRequestEncoding";


export interface RRuntimeControlMeta {
    ok?: boolean;
    host?: string;
    port?: number;
    token?: string;
    protocol?: string;
    pid?: number;
    error?: string;
}


export interface RRuntimeControlRequest {
    id: string;
    method: string;
    params?: Record<string, unknown>;
}


export interface RRuntimeControlResponse {
    id: string;
    method: string;
    ok: boolean;
    result?: unknown;
    error?: string;
    mode?: string;
    events?: unknown[];
}

export interface RRuntimeControlClientOptions {
    onEvent?: (event: unknown) => void;
}


export interface RRuntimeControlClient {
    execute(
        request: RRuntimeControlRequest
    ): Promise<RRuntimeControlResponse>;
    detach(): void;
}


interface PendingRuntimeRequest {
    method: string;
    parentId: string;
    collectEvents: boolean;
    resolve: (response: RRuntimeControlResponse) => void;
    timeout: NodeJS.Timeout | null;
    events: unknown[];
}


const sleep = function(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
};


export const readRuntimeControlMeta = async function(metaPath: string, timeoutMs: number): Promise<RRuntimeControlMeta | null> {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
        try {
            if (metaPath && fs.existsSync(metaPath)) {
                const raw = fs.readFileSync(metaPath, "utf8");

                if (raw.trim()) {
                    const parsed = JSON.parse(raw);

                    if (parsed && typeof parsed === "object") {
                        return parsed as RRuntimeControlMeta;
                    }
                }
            }
        } catch {}

        await sleep(50);
    }

    return null;
};


const runtimeEventParentId = function(event: unknown): string {
    if (!event || typeof event !== "object" || Array.isArray(event)) {
        return "";
    }

    return String(
        (event as Record<string, unknown>).parent_id || ""
    ).trim();
};


const runtimeEventType = function(event: unknown): string {
    if (!event || typeof event !== "object" || Array.isArray(event)) {
        return "";
    }

    return String((event as Record<string, unknown>).type || "").trim();
};


export const createRuntimeControlClient = function(
    meta: RRuntimeControlMeta,
    options: RRuntimeControlClientOptions = {}
): RRuntimeControlClient {
    let socket: net.Socket | null = null;
    let connectPromise: Promise<void> | null = null;
    let receiveBuffer = "";
    const pending = new Map<string, PendingRuntimeRequest>();

    const collectRuntimeEvent = function(event: unknown): void {
        const parentId = runtimeEventParentId(event);
        const collectors = Array.from(pending.values()).filter((item) => {
            return item.collectEvents;
        });

        if (parentId) {
            collectors.forEach((item) => {
                if (item.parentId === parentId) {
                    item.events.push(event);
                }
            });
            return;
        }

        if (
            runtimeEventType(event) === "prompt_state"
            && collectors.length === 1
        ) {
            collectors[0].events.push(event);
        }
    };

    const failPending = function(error: string): void {
        Array.from(pending.entries()).forEach(([id, item]) => {
            if (item.timeout) {
                clearTimeout(item.timeout);
            }
            pending.delete(id);
            item.resolve({
                id,
                method: item.method,
                ok: false,
                error
            });
        });
    };

    const bindSocket = function(sock: net.Socket): void {
        sock.setEncoding("utf8");
        sock.on("data", (chunk: string) => {
            receiveBuffer += String(chunk || "");
            let index = receiveBuffer.indexOf("\n");

            while (index >= 0) {
                const line = receiveBuffer.slice(0, index).replace(/\r$/, "");
                receiveBuffer = receiveBuffer.slice(index + 1);

                if (line.trim()) {
                    try {
                        const message = JSON.parse(line.trim());
                        const id = String(message.id || "");
                        const item = id ? pending.get(id) : null;

                        if (item) {
                            if (item.timeout) {
                                clearTimeout(item.timeout);
                            }
                            pending.delete(id);
                            item.resolve({
                                id,
                                method: String(message.method || item.method),
                                ok: message.ok === true,
                                result: message.result,
                                error: message.error ? String(message.error) : undefined,
                                mode: message.mode ? String(message.mode) : undefined,
                                events: item.events.concat(Array.isArray(message.events) ? message.events : [])
                            });
                        } else if (String(message.type || "")) {
                            collectRuntimeEvent(message);
                            options.onEvent?.(message);
                        }
                    } catch {}
                }

                index = receiveBuffer.indexOf("\n");
            }
        });
        sock.on("error", () => {
            failPending("runtime-session-socket-error");
        });
        sock.on("close", () => {
            socket = null;
            connectPromise = null;
            failPending("runtime-session-socket-closed");
        });
    };

    const ensureConnected = function(): Promise<void> {
        if (socket && !socket.destroyed) {
            return Promise.resolve();
        }

        if (connectPromise) {
            return connectPromise;
        }

        const nextConnectPromise = new Promise<void>((resolve, reject) => {
            const sock = net.createConnection({
                host: String(meta.host || "127.0.0.1"),
                port: Number(meta.port || 0)
            }, () => {
                sock.setNoDelay(true);
                sock.unref();
                socket = sock;
                bindSocket(sock);
                resolve(undefined);
            });

            sock.once("error", (error) => {
                try {
                    sock.destroy();
                } catch {}
                reject(error);
            });
        }).finally(() => {
            connectPromise = null;
        });
        connectPromise = nextConnectPromise;

        return nextConnectPromise;
    };

    return {
        execute: async function(request: RRuntimeControlRequest): Promise<RRuntimeControlResponse> {
            const requestedTimeoutMs = Number(request.params?.timeoutMs);
            const timeoutMs = Number.isFinite(requestedTimeoutMs) && requestedTimeoutMs > 0
                ? Math.max(250, requestedTimeoutMs)
                : request.method === "execute_input"
                    ? null
                    : 2500;

            try {
                await ensureConnected();

                if (!socket || socket.destroyed) {
                    return {
                        id: request.id,
                        method: request.method,
                        ok: false,
                        error: "runtime-session-connect-failed"
                    };
                }

                const activeSocket = socket;

                return await new Promise<RRuntimeControlResponse>((resolve) => {
                    const timeout = timeoutMs === null
                        ? null
                        : setTimeout(() => {
                            pending.delete(request.id);
                            resolve({
                                id: request.id,
                                method: request.method,
                                ok: false,
                                error: "runtime-session-timeout"
                            });
                        }, timeoutMs + 120);

                    pending.set(request.id, {
                        method: request.method,
                        parentId: String(request.params?.parentId || "").trim(),
                        collectEvents: request.method === "execute_input",
                        resolve,
                        timeout,
                        events: []
                    });

                    try {
                        activeSocket.write(`${encodeRuntimeControlRequest(request, String(meta.token || ""))}\n`);
                    } catch {
                        if (timeout) {
                            clearTimeout(timeout);
                        }
                        pending.delete(request.id);
                        resolve({
                            id: request.id,
                            method: request.method,
                            ok: false,
                            error: "runtime-session-write-failed"
                        });
                    }
                });
            } catch (error) {
                return {
                    id: request.id,
                    method: request.method,
                    ok: false,
                    error: error instanceof Error ? error.message : String(error)
                };
            }
        },
        detach: function(): void {
            failPending("runtime-session-detached");
            if (socket) {
                try {
                    socket.destroy();
                } catch {}
            }
            socket = null;
            connectPromise = null;
            receiveBuffer = "";
        }
    };
};

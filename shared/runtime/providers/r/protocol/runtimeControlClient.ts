import * as fs from "fs";
import * as net from "net";


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


interface PendingRuntimeRequest {
    method: string;
    parentId: string;
    collectEvents: boolean;
    resolve: (response: RRuntimeControlResponse) => void;
    timeout: NodeJS.Timeout;
    events: unknown[];
}


const dedicatedRuntimeRequestPrefix = "DMRUNTIME1";
const arrayParamSeparator = "\u001f";


const sleep = function(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
};


const safeEncode = function(value: unknown): string {
    try {
        return encodeURIComponent(String(value ?? ""));
    } catch {
        return "";
    }
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


const encodeArray = function(value: unknown): string {
    return Array.isArray(value) ? value.join(arrayParamSeparator) : "";
};


const encodeCategories = function(value: unknown): {
    values: string;
    labels: string;
    missing: string;
} {
    const categories = Array.isArray(value) ? value : [];

    return {
        values: categories.map((entry) => {
            const category = entry && typeof entry === "object"
                ? entry as Record<string, unknown>
                : {};

            return String(category.value ?? "");
        }).join(arrayParamSeparator),
        labels: categories.map((entry) => {
            const category = entry && typeof entry === "object"
                ? entry as Record<string, unknown>
                : {};

            return String(category.label ?? "");
        }).join(arrayParamSeparator),
        missing: categories.map((entry) => {
            const category = entry && typeof entry === "object"
                ? entry as Record<string, unknown>
                : {};

            return category.isMissing === true ? "1" : "0";
        }).join(arrayParamSeparator)
    };
};


const encodeMissingRange = function(value: unknown): {
    minimum: string;
    maximum: string;
} {
    if (value === null) {
        return {
            minimum: "__NULL__",
            maximum: "__NULL__"
        };
    }

    if (value && typeof value === "object") {
        const range = value as Record<string, unknown>;

        return {
            minimum: String(range.min ?? ""),
            maximum: String(range.max ?? "")
        };
    }

    return {
        minimum: "",
        maximum: ""
    };
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


const encodeRuntimeRequest = function(request: RRuntimeControlRequest, token: string): string {
    const params = request.params || {};
    const hasType = Object.prototype.hasOwnProperty.call(params, "type");
    const hasMeasure = Object.prototype.hasOwnProperty.call(params, "measure");
    const hasLabel = Object.prototype.hasOwnProperty.call(params, "label");
    const hasWidth = Object.prototype.hasOwnProperty.call(params, "width");
    const hasDecimals = Object.prototype.hasOwnProperty.call(
        params,
        "decimals"
    );
    const hasAlign = Object.prototype.hasOwnProperty.call(params, "align");
    const hasCategories = Object.prototype.hasOwnProperty.call(
        params,
        "categories"
    );
    const hasMissingRange = Object.prototype.hasOwnProperty.call(
        params,
        "missingRange"
    );
    const categories = encodeCategories(params.categories);
    const missingRange = encodeMissingRange(params.missingRange);

    return JSON.stringify({
        prefix: safeEncode(dedicatedRuntimeRequestPrefix),
        id: safeEncode(request.id),
        method: safeEncode(request.method),
        auth: safeEncode(token),
        code: safeEncode(params.code),
        mode: safeEncode(params.mode),
        timeoutMs: safeEncode(params.timeoutMs),
        sessionId: safeEncode(params.sessionId),
        topic: safeEncode(params.topic),
        package: safeEncode(params.package),
        requestPrefix: safeEncode(params.prefix),
        cursorColumn: safeEncode(params.cursorColumn),
        includeInternals: safeEncode(params.includeInternals ? "1" : ""),
        path: safeEncode(params.path),
        reader: safeEncode(params.reader),
        nrows: safeEncode(params.nrows),
        binary: safeEncode(params.binary ? "1" : ""),
        header: safeEncode(params.header === false ? "0" : params.header === true ? "1" : ""),
        rowNames: safeEncode(params.rowNames),
        sep: safeEncode(params.sep),
        quote: safeEncode(params.quote),
        dec: safeEncode(params.dec),
        naStrings: safeEncode(params.naStrings),
        skip: safeEncode(params.skip),
        stripWhite: safeEncode(params.stripWhite ? "1" : ""),
        commentChar: safeEncode(params.commentChar),
        fileEncoding: safeEncode(params.fileEncoding),
        parentId: safeEncode(params.parentId),
        reply: safeEncode(params.reply),
        names: safeEncode(encodeArray(params.names)),
        name: safeEncode(params.name),
        oldName: safeEncode(params.oldName),
        newName: safeEncode(params.newName),
        nextName: safeEncode(params.nextName),
        targetName: safeEncode(params.targetName),
        variableName: safeEncode(params.variableName),
        xVariableName: safeEncode(params.xVariableName),
        yVariableName: safeEncode(params.yVariableName),
        thresholds: safeEncode(encodeArray(params.thresholds)),
        thresholdNames: safeEncode(encodeArray(params.thresholdNames)),
        variant: safeEncode(params.variant),
        logistic: safeEncode(params.logistic ? "1" : ""),
        ecdf: safeEncode(params.ecdf ? "1" : ""),
        idm: safeEncode(params.idm),
        below: safeEncode(params.below),
        above: safeEncode(params.above),
        increasing: safeEncode(params.increasing === false ? "0" : "1"),
        bell: safeEncode(params.bell ? "1" : ""),
        decreasing: safeEncode(params.decreasing ? "1" : "0"),
        naLast: safeEncode(params.naLast === false ? "0" : "1"),
        emptyLast: safeEncode(params.emptyLast === false ? "0" : "1"),
        hasType: safeEncode(hasType ? "1" : ""),
        type: safeEncode(params.type),
        hasMeasure: safeEncode(hasMeasure ? "1" : ""),
        measure: safeEncode(params.measure),
        hasLabel: safeEncode(hasLabel ? "1" : ""),
        label: safeEncode(params.label),
        hasCategories: safeEncode(hasCategories ? "1" : ""),
        categoryValues: safeEncode(categories.values),
        categoryLabels: safeEncode(categories.labels),
        categoryMissing: safeEncode(categories.missing),
        hasMissingRange: safeEncode(hasMissingRange ? "1" : ""),
        missingRangeMin: safeEncode(missingRange.minimum),
        missingRangeMax: safeEncode(missingRange.maximum),
        hasWidth: safeEncode(hasWidth ? "1" : ""),
        width: safeEncode(params.width),
        hasDecimals: safeEncode(hasDecimals ? "1" : ""),
        decimals: safeEncode(params.decimals),
        hasAlign: safeEncode(hasAlign ? "1" : ""),
        align: safeEncode(params.align),
        row: safeEncode(params.row),
        column: safeEncode(params.column),
        position: safeEncode(params.position),
        value: safeEncode(params.value),
        rowStart: safeEncode(params.rowStart),
        rowCount: safeEncode(params.rowCount),
        columnCount: safeEncode(params.columnCount),
        start: safeEncode(params.start),
        nth: safeEncode(params.nth),
        count: safeEncode(params.count),
        columns: safeEncode(encodeArray(params.columns))
    });
};


export const createRuntimeControlClient = function(meta: RRuntimeControlMeta, options: RRuntimeControlClientOptions = {}) {
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
            clearTimeout(item.timeout);
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
                            clearTimeout(item.timeout);
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
            const timeoutMs = Math.max(250, Number(request.params?.timeoutMs) || 2500);

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
                    const timeout = setTimeout(() => {
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
                        activeSocket.write(`${encodeRuntimeRequest(request, String(meta.token || ""))}\n`);
                    } catch {
                        clearTimeout(timeout);
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

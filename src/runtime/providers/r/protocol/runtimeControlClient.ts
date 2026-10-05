import * as fs from "fs";
import * as net from "net";
import { randomUUID } from "node:crypto";
import {
    createRuntimeControlRequestSizeLimit
} from "./runtimeControlRequestEncoding";
import { createRuntimeControlDiagnostics } from "./runtimeControlDiagnostics";
import { createRuntimeControlFrameReader } from "./runtimeControlFrameReader";
import { createRuntimeOperationQueue } from "../../../session/runtimeOperationQueue";
import { createRuntimeControlRequestAdmission } from "./runtimeControlRequestAdmission";
import { readRuntimeControlEventError, readRuntimeControlResponseError, createValidatedRuntimeControlResponse,
    RuntimeControlTransportError, maximumRuntimeControlFrameBytes } from "./runtimeControlResponseValidation";
import {
    createRuntimeControlEventRetention,
    type RuntimeControlEventBudget
} from "./runtimeControlEventRetention";
import { executeRuntimeControlRequestWithDeadline } from "./runtimeControlRequestDeadline";
import { createRuntimeControlRequestPreparation } from "./runtimeControlRequestPreparation";


export interface RRuntimeControlMeta {
    boundedInput?: string;
    maxRequestBytes?: number;
    responseIdentity?: string;
    eventIdentity?: string;
    orderedOutputEncoding?: string;
    orderedOutputSession?: string;
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
    transportNonce?: string;
    params?: Record<string, unknown>;
}


export interface RRuntimeControlResponse {
    id: string;
    method: string;
    ok: boolean;
    result?: unknown;
    error?: string;
    requestRejected?: boolean;
    transportFailure?: boolean;
    completionFailure?: boolean;
    mode?: string;
    events?: unknown[];
}

export interface RRuntimeControlClientOptions {
    writeTimeoutMs?: number;
    maxOutstandingRequests?: number;
    maxRetainedEventBytes?: number;
    maxRetainedEvents?: number;
    maxFrameBytes?: number;
    onEvent?: (event: unknown) => void;
    diagnostics?: ReturnType<typeof createRuntimeControlDiagnostics>;
}


export interface RRuntimeControlDispatchOptions {
    onDispatched?(): void;
    onResponseReceived?(response: RRuntimeControlResponse): void;
    waitForResponseDelivery?(): Promise<void>;
}


export interface RRuntimeControlClient {
    getWorkspaceEpoch?(): number;
    execute(
        request: RRuntimeControlRequest,
        options?: RRuntimeControlDispatchOptions
    ): Promise<RRuntimeControlResponse>;
    detach(): void;
}


interface PendingRuntimeRequest {
    request: RRuntimeControlRequest;
    dispatchOptions?: RRuntimeControlDispatchOptions;
    method: string;
    parentId: string;
    collectEvents: boolean;
    resolve: (response: RRuntimeControlResponse) => void;
    events: unknown[];
    eventBudget: RuntimeControlEventBudget;
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
    );
};


const runtimeEventType = function(event: unknown): string {
    if (!event || typeof event !== "object" || Array.isArray(event)) {
        return "";
    }

    return String((event as Record<string, unknown>).type || "");
};


export const createRuntimeControlClient = function(
    meta: RRuntimeControlMeta,
    options: RRuntimeControlClientOptions = {}
): RRuntimeControlClient {
    const maxFrameBytes = options.maxFrameBytes ?? maximumRuntimeControlFrameBytes;
    const writeTimeoutMs = options.writeTimeoutMs ?? 2500;
    if (!Number.isSafeInteger(writeTimeoutMs) || writeTimeoutMs < 1 || writeTimeoutMs > 2147483647) {
        throw new Error("Runtime write deadline must be an integer from 1 to 2147483647 milliseconds.");
    }
    const requestSizeLimit = createRuntimeControlRequestSizeLimit(meta.maxRequestBytes);
    const maxOutstandingRequests = options.maxOutstandingRequests ?? 64;
    const eventRetention = createRuntimeControlEventRetention(options);
    if (!Number.isSafeInteger(maxFrameBytes) || maxFrameBytes < 512) {
        throw new Error("Runtime frame limit must be an integer of at least 512 bytes.");
    }
    const diagnostics = options.diagnostics || createRuntimeControlDiagnostics("native");
    if (meta.responseIdentity && meta.responseIdentity !== "attachment-request-v1") {
        throw new Error("Unsupported native response identity contract.");
    }
    const responseIdentity = meta.responseIdentity === "attachment-request-v1";
    if (
        meta.eventIdentity
        && (meta.eventIdentity !== "request-nonce-v1" || !responseIdentity)
    ) {
        throw new Error("Unsupported native event identity contract.");
    }
    const eventIdentity = meta.eventIdentity === "request-nonce-v1";
    const attachmentId = randomUUID();
    const connectionHost = String(meta.host || "127.0.0.1");
    const connectionPort = Number(meta.port || 0);
    const connectionToken = String(meta.token || "");
    let requestSequence = 0;
    let socket: net.Socket | null = null;
    let connectPromise: Promise<void> | null = null;
    let writeBarrier: Promise<void> | null = null;
    let finishSocketWrite: (() => void) | null = null;
    const pending = new Map<string, PendingRuntimeRequest>();
    let attached = true;
    const requestAdmission = createRuntimeControlRequestAdmission(maxOutstandingRequests);
    const requestQueue = createRuntimeOperationQueue();
    const requestPreparation = createRuntimeControlRequestPreparation({
        admission: requestAdmission,
        diagnostics,
        sizeLimit: requestSizeLimit,
        connectionToken,
        decorateRequest(request) {
            if (requestSequence >= Number.MAX_SAFE_INTEGER) {
                throw new Error("runtime-session-request-sequence-exhausted");
            }
            return {
                ...request,
                transportNonce: responseIdentity
                    ? `${attachmentId}:${++requestSequence}` : undefined
            };
        }
    });

    const releaseRequest = function(id: string): void {
        requestAdmission.release(id);
    };

    const collectRuntimeEvent = function(event: unknown): void {
        const retainEvent = function(item: PendingRuntimeRequest): void {
            item.eventBudget.check([event]);
            diagnostics.receiveEvent(item.request, event);
            item.events.push(event);
        };
        const parentId = runtimeEventParentId(event);
        const collectors = Array.from(pending.values()).filter((item) => {
            return item.collectEvents;
        });

        if (parentId) {
            collectors.forEach((item) => {
                if (item.parentId === parentId) {
                    retainEvent(item);
                }
            });
            return;
        }

        if (
            runtimeEventType(event) === "prompt_state"
            && collectors.length === 1
        ) {
            retainEvent(collectors[0]);
        }
    };

    const failPending = function(error: string): void {
        attached = false;
        finishSocketWrite?.();
        requestAdmission.retire(error);
        requestQueue.retire(new Error(error));
        Array.from(pending.entries()).forEach(([id, item]) => {
            pending.delete(id);
            diagnostics.record(item.request, "request.failed");
            item.resolve({
                id,
                method: item.method,
                ok: false,
                error,
                transportFailure: true,
                events: item.events.slice()
            });
        });
    };

    const bindSocket = function(sock: net.Socket): void {
        const validateEventOwner = function(
            event: unknown, responseOwner?: PendingRuntimeRequest
        ): void {
            const eventError = readRuntimeControlEventError(event);
            if (eventError) {
                throw new Error(eventError);
            }
            if (!eventIdentity) {
                // Legacy socket senders lack nonces, not a captured operation.
                // Prompt replies may overlap the one serialized input owner.
                const dispatched = Array.from(pending.values());
                const owner = responseOwner
                    || dispatched.find(item => item.method === "execute_input")
                    || dispatched[0];
                if (!owner) {
                    throw new Error("runtime-session-event-identity-mismatch");
                }
                const ownershipError = readRuntimeControlEventError(event, owner.request, !responseOwner);
                if (ownershipError) {
                    throw new Error(ownershipError);
                }
                return;
            }
            const value = event as Record<string, unknown>;
            if (typeof value.transportNonce !== "string" || !value.transportNonce) {
                throw new Error("runtime-session-invalid-event-envelope");
            }
            const owner = Array.from(pending.values()).find((item) => {
                return item.request.transportNonce === value.transportNonce;
            });
            if (!owner) {
                throw new Error("runtime-session-event-identity-mismatch");
            }
            const ownershipError = readRuntimeControlEventError(event, owner.request, !responseOwner);
            if (ownershipError) {
                throw new Error(ownershipError);
            }
            if (
                responseOwner && responseOwner !== owner
                && !(responseOwner.method === "reply_prompt"
                    && owner.method === "execute_input"
                    && responseOwner.parentId === owner.parentId)
            ) {
                throw new Error("runtime-session-event-response-owner-mismatch");
            }
        };
        const frames = createRuntimeControlFrameReader((line) => {
            if (!attached || socket !== sock) {
                return;
            }
            const message = JSON.parse(line.trim());
            if (!message || typeof message !== "object" || Array.isArray(message)) {
                throw new Error("runtime-session-invalid-frame");
            }
            // R responses carry method/ok headers; events have their own IDs.
            // A generated event ID may equal a caller's admitted request ID.
            const eventFrame = message.method === undefined && message.ok === undefined;
            if (!eventFrame && message.id !== undefined && typeof message.id !== "string") {
                throw new Error("runtime-session-invalid-frame-identity");
            }
            const id = typeof message.id === "string" ? message.id : "";
            const item = !eventFrame && id ? pending.get(id) : null;

            if (item) {
                const responseError = readRuntimeControlResponseError(message, item.request, responseIdentity);
                if (responseError) {
                    throw new Error(responseError);
                }
                const responseEvents = Array.isArray(message.events) ? message.events : [];
                item.eventBudget.check(responseEvents);
                for (const event of responseEvents) {
                    validateEventOwner(event, item);
                }
                diagnostics.receiveResponse(
                    item.request, message,
                    diagnostics.enabled ? Buffer.byteLength(line) : 0
                );
                const response = createValidatedRuntimeControlResponse(
                    message, item.events.concat(responseEvents)
                );
                item.dispatchOptions?.onResponseReceived?.(response);
                pending.delete(id);
                item.resolve(response);
                requestAdmission.releaseAfterResponseDelivery(
                    id, item.dispatchOptions?.waitForResponseDelivery, function(error): void {
                        if (attached && socket === sock) {
                            failPending(error);
                            sock.destroy();
                        }
                    }
                );
            } else if (eventFrame) {
                validateEventOwner(message);
                collectRuntimeEvent(message);
                options.onEvent?.(message);
            } else {
                throw new Error("runtime-session-unmatched-response");
            }
        }, maxFrameBytes);
        const failTransport = function(error: unknown): void {
            diagnostics.record({ id: "transport", method: "runtime.transport" }, "frame.delivery_failed", 1);
            // Do not surface remote JSON fragments or consumer exception contents.
            const detail = new RuntimeControlTransportError(
                error, "runtime-session-frame-delivery-failed"
            ).message;
            failPending(detail);
            sock.destroy();
        };
        sock.on("data", (chunk: Buffer) => {
            try {
                frames.push(chunk);
            } catch (error) {
                failTransport(error);
            }
        });
        sock.on("end", () => {
            if (!attached || socket !== sock) {
                return;
            }

            try {
                frames.end();
                // EOF forbids another response even if the local write side
                // has not emitted close yet. Retire through the shared owners.
                failPending("runtime-session-socket-ended");
                sock.destroy();
            } catch (error) {
                failTransport(error);
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
                host: connectionHost,
                port: connectionPort
            }, () => {
                if (!attached) {
                    sock.destroy();
                    resolve(undefined);
                    return;
                }
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

    const sendRequest = async function(
        request: RRuntimeControlRequest,
        encodedFrame: string,
        dispatchOptions?: RRuntimeControlDispatchOptions
    ): Promise<RRuntimeControlResponse> {
        try {
            diagnostics.record(request, "request.dequeued");
            await ensureConnected();
            while (attached && writeBarrier) {
                await writeBarrier;
            }

            if (!attached || !socket || socket.destroyed) {
                releaseRequest(request.id);
                return {
                    id: request.id,
                    method: request.method,
                    ok: false,
                    transportFailure: true,
                    error: attached ? "runtime-session-connect-failed" : "runtime-session-detached"
                };
            }

            const activeSocket = socket;

            return await new Promise<RRuntimeControlResponse>((resolve) => {
                pending.set(request.id, {
                    request,
                    dispatchOptions,
                    method: request.method,
                    parentId: String(request.params?.parentId || ""),
                    collectEvents: request.method === "execute_input",
                    resolve,
                    events: [],
                    eventBudget: eventRetention.createRequestBudget()
                });

                try {
                    const frame = encodedFrame;
                    let releaseWrite: () => void;
                    const barrier = new Promise<void>((resolveWrite) => {
                        releaseWrite = resolveWrite;
                    });
                    writeBarrier = barrier;
                    let writeDeadline: NodeJS.Timeout | null = null;
                    const settleWrite = function(): void {
                        if (writeDeadline) {
                            clearTimeout(writeDeadline);
                            writeDeadline = null;
                        }
                        if (finishSocketWrite === settleWrite) {
                            finishSocketWrite = null;
                            writeBarrier = null;
                        }
                        releaseWrite!();
                    };
                    finishSocketWrite = settleWrite;
                    writeDeadline = setTimeout(() => {
                        if (finishSocketWrite === settleWrite && attached && socket === activeSocket) {
                            failPending("runtime-session-write-timeout");
                            activeSocket.destroy();
                        }
                    }, writeTimeoutMs);
                    dispatchOptions?.onDispatched?.();
                    if (!attached || socket !== activeSocket || activeSocket.destroyed) {
                        failPending("runtime-session-detached");
                        activeSocket.destroy();
                        return;
                    }
                    diagnostics.record(
                        request, "request.sent",
                        diagnostics.enabled ? Buffer.byteLength(frame) : 0
                    );
                    activeSocket.write(frame, (error) => {
                        if (finishSocketWrite !== settleWrite) {
                            return;
                        }
                        if (error && attached && socket === activeSocket) {
                            failPending("runtime-session-write-failed");
                            activeSocket.destroy();
                            return;
                        }
                        settleWrite();
                    });
                } catch {
                    // A failed dispatch/write cannot establish whether R ran it.
                    failPending("runtime-session-write-failed");
                    activeSocket.destroy();
                }
            });
        } catch (error) {
            releaseRequest(request.id);
            return {
                id: request.id,
                method: request.method,
                ok: false,
                transportFailure: true,
                error: error instanceof Error ? error.message : String(error)
            };
        } finally {
            diagnostics.record(request, "response.resolved");
        }
    };

    return {
        getWorkspaceEpoch: requestPreparation.getWorkspaceEpoch,
        execute: function(
            request: RRuntimeControlRequest,
            dispatchOptions?: RRuntimeControlDispatchOptions
        ): Promise<RRuntimeControlResponse> {
            if (!attached) {
                return Promise.resolve({
                    id: request.id, method: request.method,
                    ok: false, error: "runtime-session-detached", transportFailure: true
                });
            }
            const prepared = requestPreparation.prepare(request);
            if (!prepared.accepted) {
                return Promise.resolve(prepared.response);
            }
            request = prepared.request;
            const frame = `${prepared.encodedRequest}\n`;
            if (request.method === "reply_prompt") {
                return executeRuntimeControlRequestWithDeadline(request,
                    (dispatch) => sendRequest(request, frame, dispatch), dispatchOptions,
                    () => diagnostics.record(request, "request.timed_out"), {
                        subscribe: requestAdmission.subscribeRetirement,
                        readEvents: () => pending.get(request.id)?.events.slice() || []
                    });
            }

            return requestQueue.run(
                () => executeRuntimeControlRequestWithDeadline(request,
                    (dispatch) => sendRequest(request, frame, dispatch), dispatchOptions,
                    () => diagnostics.record(request, "request.timed_out"), {
                        subscribe: requestAdmission.subscribeRetirement,
                        readEvents: () => pending.get(request.id)?.events.slice() || []
                    }),
                () => requestAdmission.waitForRelease(request.id)
            ).catch((error) => {
                releaseRequest(request.id);
                return {
                    id: request.id, method: request.method, ok: false,
                    error: error instanceof Error ? error.message : String(error),
                    transportFailure: true
                };
            });
        },
        detach: function(): void {
            requestPreparation.retireWorkspaceEpoch();
            failPending("runtime-session-detached");
            if (socket) {
                try {
                    socket.destroy();
                } catch {}
            }
            socket = null;
            connectPromise = null;
        }
    };
};

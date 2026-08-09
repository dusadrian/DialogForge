import {
    liveScriptEventChannels,
    type LiveScriptCapabilityResult,
    type LiveScriptOperationResult
} from "../script-editor/collaboration/liveScriptIpc";
import {
    parseLiveScriptFrameValue
} from "../script-editor/collaboration/liveScriptFrameCodec";
import {
    defaultLiveScriptRendezvousUrl
} from "../script-editor/collaboration/liveScriptInfrastructure";
import {
    parseLiveScriptSessionTicket,
    type LiveScriptSessionTicket
} from "../script-editor/collaboration/liveScriptTicket";
import type {
    LiveScriptFrame
} from "../script-editor/collaboration/liveScriptProtocol";
import type {
    LiveScriptTransport,
    LiveScriptTransportFrameEvent,
    LiveScriptTransportStateEvent
} from "../script-editor/collaboration/liveScriptTransport";


interface DialogForgeIrohBrowserModule {
    createLiveScriptTransport(): Promise<LiveScriptTransport>;
}


export interface BrowserLiveScriptTransportOptions {
    enabled?: boolean;
    moduleUrl?: string;
    rendezvousUrl?: string;
    browserJoinUrl?: string;
    publish(channel: string, event: unknown): void;
}


export interface BrowserLiveScriptTransportController {
    capability(): Promise<LiveScriptCapabilityResult>;
    host(sessionId: string): Promise<LiveScriptOperationResult>;
    join(ticket: unknown): Promise<LiveScriptOperationResult>;
    send(input: {
        frame?: unknown;
        recipientEndpointId?: unknown;
    }): Promise<LiveScriptOperationResult>;
    close(sessionId: string): Promise<LiveScriptOperationResult>;
    shutdown(): Promise<void>;
}


const defaultModuleUrl = "/vendor/dialogforge-iroh/0.1.0/index.mjs";


const operationFailure = function(error: unknown): LiveScriptOperationResult {
    return {
        ok: false,
        message: error instanceof Error
            ? error.message
            : String(error || "Browser live-script operation failed.")
    };
};


export const createBrowserLiveScriptTransport = function(
    options: BrowserLiveScriptTransportOptions
): BrowserLiveScriptTransportController {
    const moduleUrl = options.moduleUrl || defaultModuleUrl;
    let transportPromise: Promise<LiveScriptTransport> | null = null;
    let activeSessionId = "";

    const publishFrame = function(event: LiveScriptTransportFrameEvent): void {
        options.publish(liveScriptEventChannels.frame, event);
    };

    const publishState = function(event: LiveScriptTransportStateEvent): void {
        options.publish(liveScriptEventChannels.state, event);
    };

    const loadTransport = function(): Promise<LiveScriptTransport> {
        if (!transportPromise) {
            transportPromise = import(moduleUrl).then(async (moduleValue) => {
                const module = moduleValue as DialogForgeIrohBrowserModule;
                const transport = await module.createLiveScriptTransport();

                transport.onFrame(publishFrame);
                transport.onState(publishState);
                return transport;
            }).catch((error) => {
                transportPromise = null;
                throw error;
            });
        }

        return transportPromise;
    };

    const capability = async function(): Promise<LiveScriptCapabilityResult> {
        let available = options.enabled !== false;
        let message = "Browser live-script presenting and joining are available.";

        if (!available) {
            message = "Live-script sharing is disabled by deployment policy.";
        }
        else if (typeof WebAssembly !== "object" || !globalThis.isSecureContext) {
            available = false;
            message = "Browser live scripts require WebAssembly and a secure context.";
        }

        return {
            available,
            canHost: available,
            canJoin: available,
            endpointId: "",
            message,
            rendezvousUrl: options.rendezvousUrl || defaultLiveScriptRendezvousUrl,
            ...(options.browserJoinUrl
                ? { browserJoinUrl: options.browserJoinUrl }
                : {})
        };
    };

    const host = async function(sessionId: string): Promise<LiveScriptOperationResult> {
        if (options.enabled === false) {
            return operationFailure(new Error(
                "Live-script sharing is disabled by deployment policy."
            ));
        }

        try {
            const transport = await loadTransport();

            if (activeSessionId) {
                await transport.closeSession(activeSessionId);
            }

            const transportAddress = await transport.host(sessionId);
            activeSessionId = sessionId;
            return {
                ok: true,
                message: "Browser live-script transport is hosting.",
                endpointId: transport.endpointId,
                transportAddress
            };
        }
        catch (error) {
            return operationFailure(error);
        }
    };

    const join = async function(ticketValue: unknown): Promise<LiveScriptOperationResult> {
        if (options.enabled === false) {
            return operationFailure(new Error(
                "Live-script sharing is disabled by deployment policy."
            ));
        }

        const parsed = parseLiveScriptSessionTicket(ticketValue);

        if (!parsed.ok) {
            return operationFailure(new Error(parsed.message));
        }

        if (parsed.ticket.expiresAt !== undefined
            && parsed.ticket.expiresAt <= Date.now()) {
            return operationFailure(new Error("Live-script session is not available."));
        }

        try {
            const transport = await loadTransport();

            if (activeSessionId) {
                await transport.closeSession(activeSessionId);
            }

            await transport.join(parsed.ticket as LiveScriptSessionTicket);
            activeSessionId = parsed.ticket.sessionId;
            return {
                ok: true,
                message: "Browser live-script transport is connected.",
                endpointId: transport.endpointId
            };
        }
        catch (error) {
            return operationFailure(error);
        }
    };

    const send = async function(input: {
        frame?: unknown;
        recipientEndpointId?: unknown;
    }): Promise<LiveScriptOperationResult> {
        const parsed = parseLiveScriptFrameValue(input.frame);

        if (!parsed.ok) {
            return operationFailure(new Error(parsed.error.message));
        }

        try {
            const transport = await loadTransport();

            if (parsed.frame.senderEndpointId !== transport.endpointId) {
                throw new Error(
                    "Live-script sender identity does not match this browser."
                );
            }

            const recipientEndpointId = String(input.recipientEndpointId || "").trim();
            await transport.send(
                parsed.frame as LiveScriptFrame,
                recipientEndpointId || undefined
            );
            return { ok: true, message: "Live-script frame was sent." };
        }
        catch (error) {
            return operationFailure(error);
        }
    };

    const close = async function(sessionId: string): Promise<LiveScriptOperationResult> {
        if (!transportPromise) {
            return { ok: true, message: "Browser live-script transport was closed." };
        }

        try {
            const transport = await transportPromise;
            await transport.closeSession(sessionId);

            if (activeSessionId === sessionId) {
                activeSessionId = "";
            }

            return { ok: true, message: "Browser live-script transport was closed." };
        }
        catch (error) {
            return operationFailure(error);
        }
    };

    const shutdown = async function(): Promise<void> {
        if (!transportPromise) {
            return;
        }

        const transport = await transportPromise;
        activeSessionId = "";
        await transport.shutdown();
        transportPromise = null;
    };

    return {
        capability,
        host,
        join,
        send,
        close,
        shutdown
    };
};

import type {
    IpcMain,
    IpcMainInvokeEvent
} from "electron";

import {
    liveScriptEventChannels,
    liveScriptIpcChannels,
    type LiveScriptOperationResult
} from "../../script-editor/collaboration/liveScriptIpc";
import {
    parseLiveScriptFrameValue
} from "../../script-editor/collaboration/liveScriptFrameCodec";
import {
    parseLiveScriptSessionTicket
} from "../../script-editor/collaboration/liveScriptTicket";
import type {
    NativeIrohLiveScriptTransport
} from "./nativeIrohLiveScriptTransport";


export interface LiveScriptIpcControllerOptions {
    ipcMain: IpcMain;
    transport: NativeIrohLiveScriptTransport;
    rendezvousUrl?: string;
    publish(channel: string, payload: unknown): void;
}


const operationFailure = function(error: unknown): LiveScriptOperationResult {
    return {
        ok: false,
        message: error instanceof Error
            ? error.message
            : String(error || "Live-script operation failed.")
    };
};


export const createLiveScriptIpcController = function(
    options: LiveScriptIpcControllerOptions
): void {
    options.transport.onFrame((event) => {
        options.publish(liveScriptEventChannels.frame, event);
    });
    options.transport.onState((event) => {
        options.publish(liveScriptEventChannels.state, event);
    });

    options.ipcMain.handle(liveScriptIpcChannels.capability, async () => {
        const capability = await options.transport.capability();
        return {
            ...capability,
            ...(options.rendezvousUrl ? { rendezvousUrl: options.rendezvousUrl } : {})
        };
    });

    options.ipcMain.handle(liveScriptIpcChannels.host, async (
        _event: IpcMainInvokeEvent,
        input: { sessionId?: string }
    ) => {
        const sessionId = String(input?.sessionId || "").trim();

        if (sessionId.length < 16 || sessionId.length > 256) {
            return operationFailure(new Error("Live-script session ID is invalid."));
        }

        try {
            const transportAddress = await options.transport.host(sessionId);

            return {
                ok: true,
                message: "Live-script transport is hosting.",
                endpointId: options.transport.endpointId,
                transportAddress
            };
        }
        catch (error) {
            return operationFailure(error);
        }
    });

    options.ipcMain.handle(liveScriptIpcChannels.join, async (
        _event: IpcMainInvokeEvent,
        input: { ticket?: unknown }
    ) => {
        const parsed = parseLiveScriptSessionTicket(input?.ticket);

        if (!parsed.ok) {
            return operationFailure(new Error(parsed.message));
        }

        if (parsed.ticket.expiresAt !== undefined
            && parsed.ticket.expiresAt <= Date.now()) {
            return operationFailure(new Error("Live-script session is not available."));
        }

        try {
            await options.transport.join(parsed.ticket);
            return {
                ok: true,
                message: "Live-script transport is connected.",
                endpointId: options.transport.endpointId
            };
        }
        catch (error) {
            return operationFailure(error);
        }
    });

    options.ipcMain.handle(liveScriptIpcChannels.send, async (
        _event: IpcMainInvokeEvent,
        input: { frame?: unknown; recipientEndpointId?: unknown }
    ) => {
        const parsed = parseLiveScriptFrameValue(input?.frame);

        if (!parsed.ok) {
            return operationFailure(new Error(parsed.error.message));
        }

        if (parsed.frame.senderEndpointId !== options.transport.endpointId) {
            return operationFailure(new Error(
                "Live-script sender identity does not match this application."
            ));
        }

        const recipientEndpointId = String(input?.recipientEndpointId || "").trim();

        try {
            await options.transport.send(
                parsed.frame,
                recipientEndpointId || undefined
            );
            return { ok: true, message: "Live-script frame was sent." };
        }
        catch (error) {
            return operationFailure(error);
        }
    });

    options.ipcMain.handle(liveScriptIpcChannels.close, async (
        _event: IpcMainInvokeEvent,
        input: { sessionId?: string }
    ) => {
        const sessionId = String(input?.sessionId || "").trim();

        if (!sessionId) {
            return operationFailure(new Error("Live-script session ID is required."));
        }

        try {
            await options.transport.closeSession(sessionId);
            return { ok: true, message: "Live-script transport was closed." };
        }
        catch (error) {
            return operationFailure(error);
        }
    });
};

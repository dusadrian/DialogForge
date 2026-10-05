import {
    createVisibleCommandRequest
} from "../../commands/commandProtocol";
import {
    createRuntimeCommandReceipt,
    type RuntimeCommandReceipt
} from "../../commands/runtimeCommandReceipt";
import type {
    RuntimeProvider,
    RuntimeSessionManager,
    TranscriptEvent,
    WorkspaceSnapshot,
    WorkspaceUpdate
} from "../../provider-contract/runtimeProvider";
import {
    createRuntimeSessionManager,
    type RuntimeSessionManagerOptions
} from "../../session/runtimeSessionManager";
import { createRuntimeVisibleCommandDelivery } from "../../commands/runtimeVisibleCommandDelivery";
import {
    signalBrowserWebRInterrupt
} from "./webRBrowserRuntime";
import {
    createBrowserWebRSessionSnapshot
} from "./webRBrowserStartup";
import {
    type WebRSharedRuntimeControlClient
} from "./webRSharedRuntimeControl";
import {
    createRRuntimeControllerSet
} from "../r/controllers/rRuntimeControllerSet";
import {
    createRVisibleCommandExecutor
} from "../r/controllers/rVisibleCommandExecutor";
import {
    createRRuntimeEventController
} from "../r/controllers/rRuntimeEventController";
import {
    webRRuntimeManifest
} from "./webRRuntimeManifest";


const manifest = webRRuntimeManifest;


export interface WebRVisibleCommandOptions {
    activityId?: string;
    source?: string;
    outputWidth?: number;
}

export interface BrowserWebRVisibleCommandBindings {
    readConsoleOutputWidth(): number;
    recordTranscriptEvents(events: TranscriptEvent[]): void;
    setWorkspaceMetadataStatus?(): void;
}

export interface BrowserWebRSessionBindings {
    runtime?: unknown;
    isCurrentSession?(): boolean;
    runtimeControlClient: WebRSharedRuntimeControlClient;
    visibleCommands: BrowserWebRVisibleCommandBindings;
    workspaceChanged(
        update: WorkspaceUpdate,
        snapshot: WorkspaceSnapshot
    ): Promise<boolean | void>;
    refreshRuntimeEvents?(runtime: RuntimeSessionManager): Promise<void>;
    reportRuntimeEventError?(error: unknown): void;
    sessionManagerOptions?: RuntimeSessionManagerOptions;
}


export interface BrowserWebRSession {
    runtimeSessionManager: RuntimeSessionManager;
    executeVisibleCommand(
        text: string,
        options?: WebRVisibleCommandOptions
    ): Promise<RuntimeCommandReceipt>;
}


export const createBrowserWebRSession = function(
    bindings: BrowserWebRSessionBindings
): BrowserWebRSession {
    const client = bindings.runtimeControlClient;
    const runtimeEvents = createRRuntimeEventController();
    let requestSequence = 0;
    const createRequestId = function(prefix: string): string {
        requestSequence += 1;

        return `${prefix}-webr-${Date.now()}-${requestSequence}`;
    };
    const getClient = function() {
        return bindings.isCurrentSession?.() === false ? null : client;
    };
    const commandController = createRVisibleCommandExecutor({
        onTranscriptEvents: bindings.visibleCommands.recordTranscriptEvents,
        onRuntimeControlEvents: runtimeEvents.recordRuntimeControlEvents,
        getClient,
        createRequestId,
        resolveParentId: function(request) {
            return String(request.activityId || "");
        }
    });
    const executeControllerVisibleCommand = async function(
        commandText: string,
        source: string,
        snapshot: ReturnType<typeof createBrowserWebRSessionSnapshot>
    ) {
        const request = createVisibleCommandRequest({
            text: commandText,
            source,
            outputWidth: bindings.visibleCommands.readConsoleOutputWidth()
        });

        const result = await commandController.executeVisibleCommand(
            request,
            snapshot
        );

        return result;
    };
    const runtimeControllers = createRRuntimeControllerSet({
        getClient,
        createRequestId,
        executeVisibleCommand: executeControllerVisibleCommand,
        interrupt: function() {
            if (bindings.isCurrentSession?.() === false) {
                return null;
            }
            return signalBrowserWebRInterrupt(bindings.runtime);
        },
        interruptUnavailableMessage: "WebR interrupt is not available in this browser runtime.",
        interruptAcceptedMessage: "WebR worker accepted the interrupt request.",
        interruptFailedMessage: "WebR worker did not accept the interrupt request.",
        onVisibleWorkspaceRefresh:
            bindings.visibleCommands.setWorkspaceMetadataStatus
    });
    let runtimeSessionManager: RuntimeSessionManager;
    const provider: RuntimeProvider = {
        manifest,
        createSession: function() {
            return createBrowserWebRSessionSnapshot(
                "ready",
                "Browser WebR runtime is ready.",
                "connected"
            );
        },
        commandController,
        eventController: runtimeEvents,
        ...runtimeControllers,
    };
    runtimeSessionManager = createRuntimeSessionManager(
        provider,
        bindings.sessionManagerOptions
    );
    const deliverVisibleCommand = createRuntimeVisibleCommandDelivery({
        runtime: runtimeSessionManager,
        isCurrentRuntime: bindings.isCurrentSession,
        publishTranscript: bindings.visibleCommands.recordTranscriptEvents,
        publishWorkspace: bindings.workspaceChanged,
        refreshRuntimeEvents: bindings.refreshRuntimeEvents
            ? () => bindings.refreshRuntimeEvents!(runtimeSessionManager)
            : undefined,
        reportRuntimeEventError: bindings.reportRuntimeEventError
    });

    return {
        runtimeSessionManager,
        executeVisibleCommand: async function(text, options = {}) {
            const request = createVisibleCommandRequest({
                text,
                activityId: options.activityId,
                source: options.source || "browser.webr.visible-command",
                outputWidth: options.outputWidth
                    || bindings.visibleCommands.readConsoleOutputWidth()
            });

            const { accepted, result } = await deliverVisibleCommand(request);
            return createRuntimeCommandReceipt(result, accepted);
        }
    };
};

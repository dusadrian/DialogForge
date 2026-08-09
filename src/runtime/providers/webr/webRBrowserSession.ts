import {
    createVisibleCommandRequest
} from "../../commands/commandProtocol";
import type {
    RuntimeProvider,
    RuntimeSessionManager,
    TranscriptEvent,
    VisibleCommandRequest,
    WorkspaceSnapshot,
    WorkspaceUpdate
} from "../../provider-contract/runtimeProvider";
import {
    createRuntimeSessionManager,
    type RuntimeSessionManagerOptions
} from "../../session/runtimeSessionManager";
import {
    workspaceUpdateHasChanges
} from "../../workspace/workspaceUpdate";
import {
    createBrowserWebRRuntimeExtensionController,
    type WebRRuntimeMethodRouterBindings
} from "./webRRuntimeMethodRouter";
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
    webRRuntimeManifest
} from "./webRRuntimeManifest";


const manifest = webRRuntimeManifest;


export interface WebRVisibleCommandOptions {
    activityId?: string;
    preRecorded?: boolean;
    manageRuntimeBusy?: boolean;
    outputWidth?: number;
}

export interface BrowserWebRVisibleCommandBindings {
    readConsoleOutputWidth(): number;
    recordTranscriptEvents(events: TranscriptEvent[]): void;
    setWorkspaceMetadataStatus?(): void;
}

export interface BrowserWebRSessionBindings {
    runtimeControlClient: WebRSharedRuntimeControlClient;
    visibleCommands: BrowserWebRVisibleCommandBindings;
    runtimeMethods: WebRRuntimeMethodRouterBindings;
    runRuntimeOperation<T>(action: () => Promise<T>): Promise<T>;
    workspaceChanged(
        update: WorkspaceUpdate,
        snapshot: WorkspaceSnapshot
    ): Promise<void>;
    sessionManagerOptions?: RuntimeSessionManagerOptions;
}


export interface BrowserWebRSession {
    runtimeSessionManager: RuntimeSessionManager;
    executeVisibleCommand(
        text: string,
        options?: WebRVisibleCommandOptions
    ): Promise<{ ok: boolean }>;
}


export const createBrowserWebRSession = function(
    bindings: BrowserWebRSessionBindings
): BrowserWebRSession {
    const commandOptions = new WeakMap<
        VisibleCommandRequest,
        WebRVisibleCommandOptions
    >();
    const client = bindings.runtimeControlClient;
    let requestSequence = 0;
    const createRequestId = function(prefix: string): string {
        requestSequence += 1;

        return `${prefix}-webr-${Date.now()}-${requestSequence}`;
    };
    const getClient = function() {
        return client;
    };
    const commandController = createRVisibleCommandExecutor({
        getClient,
        createRequestId,
        resolveParentId: function(request) {
            return String(commandOptions.get(request)?.activityId || "");
        }
    });
    const transcriptHasFailure = function(events: Array<{
        type?: string;
        state?: string;
    }>): boolean {
        return events.some((event) => {
            return event.type === "failed"
                || event.type === "rejected"
                || event.type === "error"
                || event.state === "error";
        });
    };
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

        commandOptions.set(request, {});

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
        transcriptHasFailure,
        interrupt: function() {
            return false;
        },
        onVisibleWorkspaceRefresh:
            bindings.visibleCommands.setWorkspaceMetadataStatus
    });
    const browserExtensionController =
        createBrowserWebRRuntimeExtensionController(bindings.runtimeMethods);
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
        ...runtimeControllers,
        extensionController: {
            executeRuntimeMethod: function(request, snapshot) {
                if (
                    request.method === "runtime.interrupt"
                    || request.method === "reply_prompt"
                ) {
                    return browserExtensionController.executeRuntimeMethod!(
                        request,
                        snapshot
                    );
                }

                return runtimeControllers.extensionController.executeRuntimeMethod!(
                    request,
                    snapshot
                );
            }
        },
    };
    runtimeSessionManager = createRuntimeSessionManager(
        provider,
        bindings.sessionManagerOptions
    );

    return {
        runtimeSessionManager,
        executeVisibleCommand: async function(text, options = {}) {
            const request = createVisibleCommandRequest({
                text,
                source: "browser.webr.visible-command",
                outputWidth: options.outputWidth
                    || bindings.visibleCommands.readConsoleOutputWidth()
            });

            commandOptions.set(request, options);

            const result = await runtimeSessionManager
                .executeVisibleCommandWithEffects(request);

            bindings.visibleCommands.recordTranscriptEvents(
                result.transcriptEvents
            );

            if (workspaceUpdateHasChanges(result.workspaceUpdate)) {
                await bindings.workspaceChanged(
                    result.workspaceUpdate,
                    runtimeSessionManager.getWorkspaceSnapshot()
                );
            }

            return {
                ok: !result.transcriptEvents.some((event) => {
                    return event.type === "failed"
                        || event.type === "rejected"
                        || event.type === "error"
                        || event.state === "error";
                })
            };
        }
    };
};

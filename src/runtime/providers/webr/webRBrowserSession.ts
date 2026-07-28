import {
    createVisibleCommandRequest
} from "../../commands/commandProtocol";
import type {
    RuntimeProvider,
    RuntimeSessionManager,
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
    createBrowserWebRVisibleCommandController,
    type WebRVisibleCommandOptions,
    type WebRVisibleCommandRunnerBindings,
    type WebRVisibleCommandRuntime
} from "./webRVisibleCommandRunner";
import {
    type WebRSharedRuntimeControlClient
} from "./webRSharedRuntimeControl";
import {
    createRRuntimeControllerSet
} from "../r/controllers/rRuntimeControllerSet";
import {
    webRRuntimeManifest
} from "./webRRuntimeManifest";


const manifest = webRRuntimeManifest;


export interface BrowserWebRSessionBindings {
    runtime: WebRVisibleCommandRuntime;
    runtimeControlClient: WebRSharedRuntimeControlClient;
    visibleCommands: WebRVisibleCommandRunnerBindings;
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
    const runRuntimeOperation = bindings.runRuntimeOperation;
    const client = bindings.runtimeControlClient;
    let requestSequence = 0;
    const createRequestId = function(prefix: string): string {
        requestSequence += 1;

        return `${prefix}-webr-${Date.now()}-${requestSequence}`;
    };
    const getClient = function() {
        return client;
    };
    const visibleCommandBindings: WebRVisibleCommandRunnerBindings = {
        ...bindings.visibleCommands,
        runRuntimeOperation
    };
    const commandController = createBrowserWebRVisibleCommandController(
        visibleCommandBindings,
        function(request) {
            return commandOptions.get(request) || {};
        }
    );
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
                outputWidth: bindings.visibleCommands.readConsoleOutputWidth()
            });

            commandOptions.set(request, options);

            const result = await runtimeSessionManager
                .executeVisibleCommandWithEffects(request);

            if (workspaceUpdateHasChanges(result.workspaceUpdate)) {
                await bindings.workspaceChanged(
                    result.workspaceUpdate,
                    runtimeSessionManager.getWorkspaceSnapshot()
                );
            }

            return {
                ok: !result.transcriptEvents.some((event) => {
                    return event.type === "rejected"
                        || event.type === "error"
                        || event.state === "error";
                })
            };
        }
    };
};

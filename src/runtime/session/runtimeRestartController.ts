import {
    createRuntimeExtensionMethodRequest,
    createWorkspaceFileLoadRequest,
    createWorkspaceFileSaveRequest
} from "../extensions/runtimeExtensionProtocol";
import type {
    RuntimeSessionManager,
    RuntimeExtensionMethodResult,
    RuntimeSessionSnapshot
} from "../provider-contract/runtimeProvider";


type RestartRuntimeManager = Pick<
    RuntimeSessionManager,
    | "executeRuntimeMethod"
    | "getSnapshot"
    | "start"
    | "stop"
>;

interface RuntimeRestartOperation {
    action: "clean" | "restore";
    promise: Promise<RuntimeSessionSnapshot>;
}


export interface RuntimeRestartControllerOptions {
    runtimeSessionManager: RestartRuntimeManager;
    getRuntimeOwner?(): unknown;
    canPersistWorkspaceNow?(): boolean;
    createWorkspacePath(): string;
    saveWorkspace?(
        filePath: string, source: string, requireCurrent?: () => void
    ): Promise<RuntimeExtensionMethodResult>;
    loadWorkspace?(
        filePath: string, source: string, requireCurrent?: () => void
    ): Promise<RuntimeExtensionMethodResult>;
    describeSavedWorkspace?(filePath: string): string;
    exportSavedWorkspace?(filePath: string): Promise<string>;
    removeWorkspaceFile(filePath: string): void;
    invalidateDatasetPreview(): void;
    deferRuntimeSessionReady?(): () => void;
    setRuntimeSession(snapshot: RuntimeSessionSnapshot): void;
    sendRuntimeSession(snapshot: RuntimeSessionSnapshot): void;
    refreshWorkspace(): Promise<unknown>;
    captureWorkspaceBaseline(source: string): Promise<void>;
}


export interface RuntimeRestartController {
    restart(
        action: "clean" | "restore",
        source: string
    ): Promise<RuntimeSessionSnapshot>;
}


export const createRuntimeRestartController = function(
    options: RuntimeRestartControllerOptions
): RuntimeRestartController {
    let pendingRestart: RuntimeRestartOperation | null = null;

    const captureRestartRuntime = function(expected = options.runtimeSessionManager.getSnapshot()): () => void {
        const owner = options.getRuntimeOwner ? options.getRuntimeOwner() : options.runtimeSessionManager;
        const providerId = expected.providerId;
        const generation = expected.lifecycleGeneration;
        const status = expected.status;
        return function(): void {
            const currentOwner = options.getRuntimeOwner ? options.getRuntimeOwner() : options.runtimeSessionManager;
            const current = options.runtimeSessionManager.getSnapshot();
            if (
                currentOwner !== owner || current.providerId !== providerId
                || current.lifecycleGeneration !== generation || current.status !== status
            ) {
                throw new Error("Runtime session changed during restart; no further restart steps were applied.");
            }
        };
    };
    const saveWorkspace = function(filePath: string, source: string, requireCurrent: () => void) {
        return options.saveWorkspace
            ? options.saveWorkspace(filePath, source, requireCurrent)
            : options.runtimeSessionManager.executeRuntimeMethod(
                createWorkspaceFileSaveRequest(filePath, source)
            );
    };
    const loadWorkspace = function(filePath: string, source: string, requireCurrent: () => void) {
        return options.loadWorkspace
            ? options.loadWorkspace(filePath, source, requireCurrent)
            : options.runtimeSessionManager.executeRuntimeMethod(
                createWorkspaceFileLoadRequest(filePath, source)
            );
    };
    const prepareWorkspaceRecovery = async function(filePath: string): Promise<string> {
        const retained = options.describeSavedWorkspace
            ? options.describeSavedWorkspace(filePath)
            : `The saved workspace is available at ${filePath}.`;
        if (!options.exportSavedWorkspace) {
            return retained;
        }
        try {
            const fileName = await options.exportSavedWorkspace(filePath);
            return `${retained} A recovery download was requested as ${fileName}.`;
        }
        catch (error) {
            const failure = error instanceof Error ? error.message : String(error);
            return `${retained} Recovery export failed: ${failure}`;
        }
    };
    const performRestart = async function(
        action: "clean" | "restore",
        source: string,
        releaseReadyPublication: () => void
    ): Promise<RuntimeSessionSnapshot> {
        const restore = action === "restore"
            && options.runtimeSessionManager.getSnapshot().status === "ready";
        if (restore && options.canPersistWorkspaceNow?.() === false) {
            throw new Error("Finish the current runtime operation or input before restarting and restoring the workspace.");
        }
        const workspacePath = options.createWorkspacePath();
        let workspaceSaved = false;
        let workspaceRestored = false;
        let workspaceRestoreMessage = "";
        let requireCurrent = captureRestartRuntime();
        requireCurrent();

        if (restore) {
            let saved = await saveWorkspace(workspacePath, `${source}.save`, requireCurrent);
            requireCurrent();

            if (saved.status !== "ready") {
                await options.runtimeSessionManager.executeRuntimeMethod(
                    createRuntimeExtensionMethodRequest({
                        method: "runtime.interrupt",
                        params: {},
                        source: `${source}.interrupt`
                    })
                );
                requireCurrent();
                saved = await saveWorkspace(workspacePath, `${source}.save-after-interrupt`, requireCurrent);
                requireCurrent();
            }

            workspaceSaved = saved.status === "ready";

            if (!workspaceSaved) {
                options.removeWorkspaceFile(workspacePath);
                throw new Error("Unable to save the workspace. R has not been restarted; try interrupting the current command first.");
            }
        }

        options.invalidateDatasetPreview();
        requireCurrent();
        const stopped = await options.runtimeSessionManager.stop();
        if (stopped.status !== "stopped") {
            const recovery = workspaceSaved
                ? await prepareWorkspaceRecovery(workspacePath)
                : "";
            throw new Error(`Runtime did not stop; restart was not continued. ${recovery}`.trim());
        }
        requireCurrent = captureRestartRuntime(stopped);
        requireCurrent();
        let snapshot: RuntimeSessionSnapshot;
        try {
            snapshot = await options.runtimeSessionManager.start();
        }
        catch (error) {
            if (!workspaceSaved) {
                throw error;
            }
            const failure = error instanceof Error ? error.message : String(error);
            const recovery = await prepareWorkspaceRecovery(workspacePath);
            // Keep the saved data and report it without publishing a possibly replaced session.
            throw new Error(
                `Runtime restart did not complete. ${failure} ${recovery}`
            );
        }
        requireCurrent = captureRestartRuntime(snapshot);
        requireCurrent();

        if (workspaceSaved && snapshot.status !== "ready") {
            const failure = snapshot.message || "The runtime did not become ready.";
            const recovery = await prepareWorkspaceRecovery(workspacePath);
            requireCurrent();
            workspaceRestoreMessage =
                `Runtime restart did not complete. ${failure} ${recovery}`;
        }

        if (workspaceSaved && snapshot.status === "ready") {
            let loaded: RuntimeExtensionMethodResult | null = null;
            try {
                loaded = await loadWorkspace(workspacePath, `${source}.load`, requireCurrent);
            }
            catch {
                // A live session can report restore failure; retirement cannot publish here.
                requireCurrent();
            }
            requireCurrent();

            if (loaded?.status === "ready") {
                snapshot = options.runtimeSessionManager.getSnapshot();
                workspaceRestored = true;
            }
            else {
                const recovery = await prepareWorkspaceRecovery(workspacePath);
                requireCurrent();
                workspaceRestoreMessage = `R restarted, but the workspace could not be restored. ${recovery}`;
            }
        }

        if (restore) {
            snapshot = Object.assign({}, snapshot, {
                workspaceRestored,
                workspaceRestoreMessage
            });
        }

        requireCurrent();
        releaseReadyPublication();
        options.setRuntimeSession(snapshot);
        requireCurrent();
        options.sendRuntimeSession(snapshot);

        if (snapshot.status === "ready") {
            await options.refreshWorkspace();
            requireCurrent();
            await options.captureWorkspaceBaseline(
                `${source}.baseline`
            );
            requireCurrent();
        }

        if (!workspaceSaved || workspaceRestored) {
            options.removeWorkspaceFile(workspacePath);
        }

        return snapshot;
    };

    return {
        restart: function(action, source): Promise<RuntimeSessionSnapshot> {
            if (pendingRestart) {
                return pendingRestart.action === action
                    ? pendingRestart.promise
                    : Promise.reject(new Error("A different runtime restart is already in progress."));
            }
            const operation: RuntimeRestartOperation = {
                action,
                promise: Promise.resolve().then(async () => {
                    let releaseReady = options.deferRuntimeSessionReady?.();
                    const releaseReadyPublication = function(): void {
                        const release = releaseReady;
                        releaseReady = undefined;
                        release?.();
                    };

                    try {
                        return await performRestart(action, source, releaseReadyPublication);
                    }
                    finally {
                        releaseReadyPublication();
                    }
                }).finally(() => {
                    if (pendingRestart === operation) {
                        pendingRestart = null;
                    }
                })
            };
            pendingRestart = operation;
            return operation.promise;
        }
    };
};

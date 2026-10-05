import {
    createRuntimeRestartController,
    type RuntimeRestartControllerOptions
} from "../../session/runtimeRestartController";
import {
    createRuntimeExtensionMethodResult,
    createWorkspaceFileLoadRequest,
    createWorkspaceFileSaveRequest
} from "../../extensions/runtimeExtensionProtocol";
import type {
    RuntimeSessionManager,
    RuntimeSessionSnapshot
} from "../../provider-contract/runtimeProvider";
export interface WebRRuntimeRestartAdapterOptions {
    getRuntime(): {
        FS: {
            readFile(path: string): Promise<Uint8Array>;
            writeFile(path: string, bytes: Uint8Array): Promise<unknown>;
        };
    } | null | undefined;
    getRuntimeSessionManager(): RuntimeSessionManager | null | undefined;
    readRuntimeSnapshot(): RuntimeSessionSnapshot;
    canPersistWorkspaceNow?(): boolean;
    downloadSavedWorkspace?(fileName: string, bytes: Uint8Array): Promise<void> | void;
    stopRuntime(): Promise<void>;
    startRuntime(): Promise<RuntimeSessionSnapshot>;
    invalidateDatasetPreview(): void;
    deferRuntimeSessionReady?(): () => void;
    setRuntimeSession(snapshot: RuntimeSessionSnapshot): void;
    sendRuntimeSession(snapshot: RuntimeSessionSnapshot): void;
    refreshWorkspace(): Promise<unknown>;
    captureWorkspaceBaseline(source: string): Promise<void>;
}


export const createWebRRuntimeRestartAdapter = function(
    options: WebRRuntimeRestartAdapterOptions
) {
    // Worker files disappear at stop; keep successful saves in the host until restore succeeds.
    const savedWorkspaces = new Map<string, Uint8Array>();
    const downloadSavedWorkspace = options.downloadSavedWorkspace;
    let sequence = 0;
    const manager = function(): RuntimeSessionManager {
        const current = options.getRuntimeSessionManager();
        if (!current) {
            throw new Error("Runtime session is not ready for workspace persistence.");
        }
        return current;
    };
    const persistWorkspace: NonNullable<RuntimeRestartControllerOptions["saveWorkspace"]> =
        async function(filePath, source, requireCurrent) {
            const request = createWorkspaceFileSaveRequest(filePath, source);
            try {
                const runtime = options.getRuntime();
                const runtimeManager = manager();
                requireCurrent?.();
                if (!runtime) {
                    throw new Error("Worker filesystem is not available.");
                }
                const result = await runtimeManager.executeRuntimeMethod(request);
                requireCurrent?.();
                if (result.status === "ready") {
                    const bytes = new Uint8Array(await runtime.FS.readFile(filePath));
                    savedWorkspaces.set(filePath, bytes);
                    requireCurrent?.();
                }
                return result;
            }
            catch (error) {
                return createRuntimeExtensionMethodResult({
                    status: "failed",
                    providerId: options.readRuntimeSnapshot().providerId,
                    method: request.method,
                    message: error instanceof Error ? error.message : String(error)
                });
            }
        };
    const restoreWorkspace: NonNullable<RuntimeRestartControllerOptions["loadWorkspace"]> =
        async function(filePath, source, requireCurrent) {
            const request = createWorkspaceFileLoadRequest(filePath, source);
            const runtime = options.getRuntime();
            const runtimeManager = manager();
            requireCurrent?.();
            const bytes = savedWorkspaces.get(filePath);
            if (!runtime || !bytes) {
                throw new Error("Saved workspace bytes are not available.");
            }
            await runtime.FS.writeFile(filePath, bytes);
            requireCurrent?.();
            const result = await runtimeManager.executeRuntimeMethod(request);
            requireCurrent?.();
            return result;
        };
    const controller = createRuntimeRestartController({
        getRuntimeOwner: options.getRuntimeSessionManager,
        canPersistWorkspaceNow: options.canPersistWorkspaceNow,
        runtimeSessionManager: {
            getSnapshot: options.readRuntimeSnapshot,
            executeRuntimeMethod: (request) => manager().executeRuntimeMethod(request),
            stop: async function() {
                await options.stopRuntime();
                return options.readRuntimeSnapshot();
            },
            start: options.startRuntime
        },
        createWorkspacePath: function() {
            sequence += 1;
            return `/tmp/dialogforge-restart-${Date.now()}-${sequence}.RData`;
        },
        saveWorkspace: persistWorkspace,
        loadWorkspace: restoreWorkspace,
        describeSavedWorkspace: (filePath) => `Saved bytes are retained by the browser host as ${filePath}.`,
        exportSavedWorkspace: downloadSavedWorkspace
            ? async function(filePath) {
                const bytes = savedWorkspaces.get(filePath);
                if (!bytes) {
                    throw new Error("Saved workspace bytes are not available.");
                }
                const fileName = filePath.slice(filePath.lastIndexOf("/") + 1);
                await downloadSavedWorkspace(fileName, new Uint8Array(bytes));
                return fileName;
            }
            : undefined,
        removeWorkspaceFile: (filePath) => { savedWorkspaces.delete(filePath); },
        invalidateDatasetPreview: options.invalidateDatasetPreview,
        deferRuntimeSessionReady: options.deferRuntimeSessionReady,
        setRuntimeSession: options.setRuntimeSession,
        sendRuntimeSession: options.sendRuntimeSession,
        refreshWorkspace: options.refreshWorkspace,
        captureWorkspaceBaseline: options.captureWorkspaceBaseline
    });

    return {
        restart: controller.restart,
        readSavedWorkspace: function(filePath: string): Uint8Array | null {
            const bytes = savedWorkspaces.get(filePath);
            return bytes ? new Uint8Array(bytes) : null;
        }
    };
};

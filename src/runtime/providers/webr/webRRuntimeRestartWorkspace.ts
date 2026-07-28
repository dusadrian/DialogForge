import type {
    RuntimeExtensionMethodResult,
    RuntimeSessionManager
} from "../../provider-contract/runtimeProvider";


export interface WebRRuntimeRestartWorkspaceRuntime {
    FS: {
        readFile(path: string): Promise<Uint8Array>;
        writeFile(path: string, bytes: Uint8Array): Promise<unknown>;
    };
}


export interface WebRRuntimeRestartWorkspaceControllerOptions {
    workspacePath?: string;
    runtimeName?: string;
    getRuntime(): WebRRuntimeRestartWorkspaceRuntime | null;
    getRuntimeSessionManager(): RuntimeSessionManager | null;
    workspaceRestored(
        result: RuntimeExtensionMethodResult,
        manager: RuntimeSessionManager
    ): Promise<void> | void;
}


export interface WebRRuntimeRestartWorkspaceController {
    save(): Promise<Uint8Array | null>;
    restore(bytes: Uint8Array | null): Promise<void>;
}


export const webRRestartWorkspacePath =
    "/web/.dialogforge-runtime-restart.RData";


export const createWebRRuntimeRestartWorkspaceController = function(
    options: WebRRuntimeRestartWorkspaceControllerOptions
): WebRRuntimeRestartWorkspaceController {
    const workspacePath = String(
        options.workspacePath || webRRestartWorkspacePath
    );
    const runtimeName = String(options.runtimeName || "WebR");

    const save = async function(): Promise<Uint8Array | null> {
        const runtime = options.getRuntime();
        const manager = options.getRuntimeSessionManager();

        if (!runtime || !manager) {
            return null;
        }

        const result = await manager.executeRuntimeMethod({
            method: "runtime.save_workspace_file",
            params: {
                path: workspacePath
            },
            source: "browser.runtime.restart"
        });

        if (result.status !== "ready") {
            throw new Error(
                result.message
                || `${runtimeName} workspace could not be saved before restart.`
            );
        }

        return runtime.FS.readFile(workspacePath);
    };

    const restore = async function(
        bytes: Uint8Array | null
    ): Promise<void> {
        const runtime = options.getRuntime();

        if (!bytes || !runtime) {
            return;
        }

        await runtime.FS.writeFile(workspacePath, bytes);
        const manager = options.getRuntimeSessionManager();

        if (!manager) {
            throw new Error(`${runtimeName} runtime session is not ready.`);
        }

        const result = await manager.executeRuntimeMethod({
            method: "runtime.load_workspace_file",
            params: {
                path: workspacePath
            },
            source: "browser.runtime.restart"
        });

        if (result.status !== "ready") {
            throw new Error(
                result.message
                || `${runtimeName} workspace could not be restored after restart.`
            );
        }

        await options.workspaceRestored(result, manager);
    };

    return {
        save,
        restore
    };
};

import {
    createRuntimeExtensionMethodRequest,
    createWorkspaceFileLoadRequest,
    createWorkspaceFileSaveRequest
} from "../../runtime/extensions/runtimeExtensionProtocol";
import type {
    RuntimeSessionManager,
    RuntimeSessionSnapshot
} from "../../runtime/provider-contract/runtimeProvider";


type RestartRuntimeManager = Pick<
    RuntimeSessionManager,
    | "executeRuntimeMethod"
    | "getSnapshot"
    | "start"
    | "stop"
>;


export interface RuntimeRestartControllerOptions {
    runtimeSessionManager: RestartRuntimeManager;
    createWorkspacePath(): string;
    removeWorkspaceFile(filePath: string): void;
    invalidateDatasetPreview(): void;
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
    const restart = async function(
        action: "clean" | "restore",
        source: string
    ): Promise<RuntimeSessionSnapshot> {
        const restore = action === "restore"
            && options.runtimeSessionManager.getSnapshot().status === "ready";
        const workspacePath = options.createWorkspacePath();
        let workspaceSaved = false;
        let workspaceRestored = false;
        let workspaceRestoreMessage = "";

        if (restore) {
            let saved = await options.runtimeSessionManager
                .executeRuntimeMethod(
                    createWorkspaceFileSaveRequest(
                        workspacePath,
                        `${source}.save`
                    )
                );

            if (saved.status !== "ready") {
                await options.runtimeSessionManager.executeRuntimeMethod(
                    createRuntimeExtensionMethodRequest({
                        method: "runtime.interrupt",
                        params: {},
                        source: `${source}.interrupt`
                    })
                );
                saved = await options.runtimeSessionManager
                    .executeRuntimeMethod(
                        createWorkspaceFileSaveRequest(
                            workspacePath,
                            `${source}.save-after-interrupt`
                        )
                    );
            }

            workspaceSaved = saved.status === "ready";

            if (!workspaceSaved) {
                options.removeWorkspaceFile(workspacePath);
                throw new Error("Unable to save the workspace. R has not been restarted; try interrupting the current command first.");
            }
        }

        options.invalidateDatasetPreview();
        await options.runtimeSessionManager.stop();
        let snapshot = await options.runtimeSessionManager.start();

        if (workspaceSaved && snapshot.status === "ready") {
            const loaded = await options.runtimeSessionManager
                .executeRuntimeMethod(
                    createWorkspaceFileLoadRequest(
                        workspacePath,
                        `${source}.load`
                    )
                );

            if (loaded.status === "ready") {
                snapshot = options.runtimeSessionManager.getSnapshot();
                workspaceRestored = true;
            }
            else {
                workspaceRestoreMessage = `R restarted, but the workspace could not be restored. The saved workspace is available at ${workspacePath}.`;
            }
        }

        if (!workspaceSaved || workspaceRestored) {
            options.removeWorkspaceFile(workspacePath);
        }

        if (restore) {
            snapshot = Object.assign({}, snapshot, {
                workspaceRestored,
                workspaceRestoreMessage
            });
        }

        options.setRuntimeSession(snapshot);
        options.sendRuntimeSession(snapshot);

        if (snapshot.status === "ready") {
            await options.refreshWorkspace();
            await options.captureWorkspaceBaseline(
                `${source}.baseline`
            );
        }

        return snapshot;
    };

    return {
        restart
    };
};

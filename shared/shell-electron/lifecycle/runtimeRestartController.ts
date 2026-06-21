import {
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
        const restore = action === "restore";
        const workspacePath = options.createWorkspacePath();

        if (restore) {
            const saved = await options.runtimeSessionManager
                .executeRuntimeMethod(
                    createWorkspaceFileSaveRequest(
                        workspacePath,
                        `${source}.save`
                    )
                );

            if (saved.status !== "ready") {
                return options.runtimeSessionManager.getSnapshot();
            }
        }

        options.invalidateDatasetPreview();
        await options.runtimeSessionManager.stop();
        let snapshot = await options.runtimeSessionManager.start();

        if (restore && snapshot.status === "ready") {
            const loaded = await options.runtimeSessionManager
                .executeRuntimeMethod(
                    createWorkspaceFileLoadRequest(
                        workspacePath,
                        `${source}.load`
                    )
                );

            if (loaded.status === "ready") {
                snapshot = options.runtimeSessionManager.getSnapshot();
            }
        }

        options.removeWorkspaceFile(workspacePath);
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

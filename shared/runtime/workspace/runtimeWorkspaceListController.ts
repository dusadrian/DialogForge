import type {
    RuntimeSessionSnapshot,
    RuntimeWorkspaceController,
    WorkspaceObjectSnapshot,
    WorkspaceSnapshot
} from "../provider-contract/runtimeProvider";
import {
    createWorkspaceSnapshot
} from "./workspaceProtocol";


export interface RuntimeWorkspaceListControllerOptions {
    providerWorkspaceController?: RuntimeWorkspaceController;
    fallbackWorkspaceController: RuntimeWorkspaceController;
    listImportedTables(): WorkspaceObjectSnapshot[];
    getSnapshot(): RuntimeSessionSnapshot;
}


export interface RuntimeWorkspaceListController {
    list(): Promise<WorkspaceSnapshot>;
}


export const createRuntimeWorkspaceListController = function(
    options: RuntimeWorkspaceListControllerOptions
): RuntimeWorkspaceListController {
    return {
        list: async function(): Promise<WorkspaceSnapshot> {
            const snapshot = options.getSnapshot();

            if (options.providerWorkspaceController) {
                const objects = (
                    await options.providerWorkspaceController.listWorkspaceObjects(
                        snapshot
                    )
                ).concat(options.listImportedTables());

                return createWorkspaceSnapshot({
                    status: "ready",
                    providerId: snapshot.providerId,
                    objects,
                    message: "Workspace objects were read from the runtime provider."
                });
            }

            const objects =
                await options.fallbackWorkspaceController.listWorkspaceObjects(
                    snapshot
                );

            return createWorkspaceSnapshot({
                status: "ready",
                providerId: snapshot.providerId,
                objects,
                message: "Placeholder workspace objects; no language process was queried."
            });
        }
    };
};

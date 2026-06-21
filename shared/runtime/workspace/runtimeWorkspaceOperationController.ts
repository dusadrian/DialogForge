import type {
    RuntimeSessionSnapshot,
    RuntimeWorkspaceController,
    WorkspaceRenameRequest,
    WorkspaceSnapshot
} from "../provider-contract/runtimeProvider";
import {
    createWorkspaceSnapshot
} from "./workspaceProtocol";
import type {
    RuntimeActiveDatasetController
} from "../session/runtimeActiveDatasetController";
import type {
    RuntimeWorkspaceListController
} from "./runtimeWorkspaceListController";
import type {
    RuntimeWorkspaceMutationController
} from "./runtimeWorkspaceMutationController";


export interface RuntimeWorkspaceOperationControllerOptions {
    providerWorkspaceController?: RuntimeWorkspaceController;
    workspaceListController: RuntimeWorkspaceListController;
    workspaceMutationController: RuntimeWorkspaceMutationController;
    activeDatasetController: RuntimeActiveDatasetController;
    getSnapshot(): RuntimeSessionSnapshot;
    recordRuntimeEvent(
        type: string,
        objectName: string,
        detail: string,
        payload: Record<string, unknown>
    ): void;
}


export interface RuntimeWorkspaceOperationController {
    listWorkspaceObjects(): Promise<WorkspaceSnapshot>;
    removeWorkspaceObjects(objectNames: string[]): Promise<WorkspaceSnapshot>;
    renameWorkspaceObject(request: WorkspaceRenameRequest): Promise<WorkspaceSnapshot>;
    clearWorkspace(): Promise<WorkspaceSnapshot>;
}


export const createRuntimeWorkspaceOperationController = function(
    options: RuntimeWorkspaceOperationControllerOptions
): RuntimeWorkspaceOperationController {
    const unavailable = function(): WorkspaceSnapshot {
        const snapshot = options.getSnapshot();

        return createWorkspaceSnapshot({
            status: "unavailable",
            providerId: snapshot.providerId,
            message: "Runtime session is not ready."
        });
    };

    const listWorkspaceObjects = async function(): Promise<WorkspaceSnapshot> {
        const snapshot = options.getSnapshot();

        if (snapshot.status !== "ready") {
            return unavailable();
        }

        const workspace = await options.workspaceListController.list();
        const objects = options.activeDatasetController.rememberWorkspaceObjects(
            workspace.objects
        );

        options.activeDatasetController.reconcileAfterWorkspaceRefresh(
            objects,
            "workspace-refresh"
        );

        return createWorkspaceSnapshot({
            status: workspace.status,
            providerId: snapshot.providerId,
            objects,
            message: workspace.message
        });
    };

    return {
        listWorkspaceObjects,
        removeWorkspaceObjects: async function(objectNames) {
            const snapshot = options.getSnapshot();
            const names = Array.from(new Set(objectNames.map((name) => {
                return String(name || "").trim();
            }).filter(Boolean)));

            if (snapshot.status !== "ready") {
                return unavailable();
            }

            if (names.length === 0) {
                return createWorkspaceSnapshot({
                    status: "invalid",
                    providerId: snapshot.providerId,
                    objects: (await listWorkspaceObjects()).objects,
                    message: "No workspace objects were selected for removal."
                });
            }

            if (
                !options.providerWorkspaceController?.removeWorkspaceObjects &&
                !options.workspaceMutationController.canFallbackRemove(names)
            ) {
                return createWorkspaceSnapshot({
                    status: "unsupported",
                    providerId: snapshot.providerId,
                    objects: (await listWorkspaceObjects()).objects,
                    message: "Selected workspace object(s) cannot be removed by this provider."
                });
            }

            const objects = await options.workspaceMutationController.remove(names);
            options.activeDatasetController.clearIfRemoved(names);
            options.activeDatasetController.rememberWorkspaceObjects(objects);
            options.recordRuntimeEvent(
                "workspace.object.removed",
                names.join(", "),
                "Workspace object(s) removed.",
                { objectNames: names }
            );

            return createWorkspaceSnapshot({
                status: "ready",
                providerId: snapshot.providerId,
                objects,
                message: "Workspace object(s) removed."
            });
        },
        renameWorkspaceObject: async function(request) {
            const snapshot = options.getSnapshot();
            const oldName = String(request.oldName || "").trim();
            const newName = String(request.newName || "").trim();

            if (snapshot.status !== "ready") {
                return unavailable();
            }

            if (!oldName || !newName) {
                return createWorkspaceSnapshot({
                    status: "invalid",
                    providerId: snapshot.providerId,
                    objects: (await listWorkspaceObjects()).objects,
                    message: "Both the current and replacement workspace object names are required."
                });
            }

            if (oldName === newName) {
                return createWorkspaceSnapshot({
                    status: "ready",
                    providerId: snapshot.providerId,
                    objects: (await listWorkspaceObjects()).objects,
                    message: "Workspace object already has the requested name."
                });
            }

            const currentObjects = (await listWorkspaceObjects()).objects;
            const currentNames = new Set(currentObjects.map((object) => {
                return object.name;
            }));

            if (!currentNames.has(oldName)) {
                return createWorkspaceSnapshot({
                    status: "not-found",
                    providerId: snapshot.providerId,
                    objects: currentObjects,
                    message: "Workspace object was not found."
                });
            }

            if (currentNames.has(newName)) {
                return createWorkspaceSnapshot({
                    status: "conflict",
                    providerId: snapshot.providerId,
                    objects: currentObjects,
                    message: "A workspace object with the replacement name already exists."
                });
            }

            if (
                !options.providerWorkspaceController?.renameWorkspaceObject &&
                !options.workspaceMutationController.canFallbackRename(oldName)
            ) {
                return createWorkspaceSnapshot({
                    status: "unsupported",
                    providerId: snapshot.providerId,
                    objects: (await listWorkspaceObjects()).objects,
                    message: "Selected workspace object cannot be renamed by this provider."
                });
            }

            const objects = await options.workspaceMutationController.rename({
                oldName,
                newName,
                source: request.source
            });
            options.activeDatasetController.rename(oldName, newName);

            options.activeDatasetController.rememberWorkspaceObjects(objects);
            options.recordRuntimeEvent(
                "workspace.object.renamed",
                oldName + " -> " + newName,
                "Workspace object renamed.",
                {
                    oldName,
                    newName,
                    source: request.source
                }
            );

            return createWorkspaceSnapshot({
                status: "ready",
                providerId: snapshot.providerId,
                objects,
                message: "Workspace object renamed."
            });
        },
        clearWorkspace: async function() {
            const snapshot = options.getSnapshot();

            if (snapshot.status !== "ready") {
                return unavailable();
            }

            const previousNames = (await listWorkspaceObjects()).objects.map((object) => {
                return object.name;
            });

            const objects = await options.workspaceMutationController.clear();
            options.activeDatasetController.clearIfRemoved(previousNames);
            options.activeDatasetController.rememberWorkspaceObjects(objects);
            options.recordRuntimeEvent(
                "workspace.cleared",
                "",
                "Workspace cleared.",
                { objectNames: previousNames }
            );

            return createWorkspaceSnapshot({
                status: "ready",
                providerId: snapshot.providerId,
                objects,
                message: "Workspace cleared."
            });
        }
    };
};

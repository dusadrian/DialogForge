import type {
    RuntimeSessionSnapshot,
    RuntimeWorkspaceController,
    WorkspaceListOptions,
    WorkspaceObjectSnapshot,
    WorkspaceRenameRequest,
    WorkspaceSnapshot
} from "../provider-contract/runtimeProvider";
import {
    createUnsupportedOperationResult
} from "../../core/contracts/operationResult";
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
    getWorkspaceSnapshot?(): WorkspaceSnapshot;
    getWorkspaceGeneration?(): number;
    recordRuntimeEvent(
        type: string,
        objectName: string,
        detail: string,
        payload: Record<string, unknown>
    ): void;
}


export interface RuntimeWorkspaceOperationController {
    listWorkspaceObjects(options?: WorkspaceListOptions): Promise<WorkspaceSnapshot>;
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

    const listWorkspaceObjects = async function(
        listOptions?: WorkspaceListOptions
    ): Promise<WorkspaceSnapshot> {
        const snapshot = options.getSnapshot();

        if (snapshot.status !== "ready") {
            return unavailable();
        }

        const generation = options.getWorkspaceGeneration?.();
        const workspace = await options.workspaceListController.list(
            listOptions
        );

        if (generation !== options.getWorkspaceGeneration?.()) {
            return unavailable();
        }

        if (workspace.status !== "ready") {
            return workspace;
        }
        const objects = options.activeDatasetController.rememberWorkspaceObjects(
            workspace.objects,
            workspace.workspaceRevision
        );

        const acceptedWorkspace = options.getWorkspaceSnapshot?.();

        if (acceptedWorkspace && acceptedWorkspace.status !== "ready") {
            return acceptedWorkspace;
        }

        options.activeDatasetController.reconcileAfterWorkspaceRefresh(
            objects,
            "workspace-refresh"
        );

        return createWorkspaceSnapshot({
            status: workspace.status,
            workspaceRevision: acceptedWorkspace?.workspaceRevision || workspace.workspaceRevision,
            providerId: snapshot.providerId,
            objects,
            message: workspace.message
        });
    };

    const acceptMutationWorkspace = function(
        result: WorkspaceSnapshot | WorkspaceObjectSnapshot[]
    ): WorkspaceSnapshot {
        const workspace = Array.isArray(result)
            ? createWorkspaceSnapshot({
                status: "ready",
                providerId: options.getSnapshot().providerId,
                objects: result
            })
            : result;

        if (workspace.status !== "ready") {
            return workspace;
        }

        const objects = options.activeDatasetController.rememberWorkspaceObjects(
            workspace.objects,
            workspace.workspaceRevision
        );

        return options.getWorkspaceSnapshot?.() || createWorkspaceSnapshot({
            ...workspace,
            objects
        });
    };

    const performWorkspaceMutation = async function(
        operation: "remove" | "rename" | "clear",
        mutate: () => Promise<WorkspaceSnapshot | WorkspaceObjectSnapshot[]>
    ): Promise<WorkspaceSnapshot | WorkspaceObjectSnapshot[]> {
        const generation = options.getWorkspaceGeneration?.();

        try {
            return await mutate();
        }
        catch (error) {
            if (generation !== options.getWorkspaceGeneration?.()) {
                return unavailable();
            }

            const message = "The workspace change could not be confirmed. "
                + "It may already have been applied. Displayed objects may be stale. "
                + "Run another command to refresh the workspace before trying the change again.";

            options.recordRuntimeEvent(
                "workspace.mutation.uncertain", operation, message,
                { operation, error: error instanceof Error ? error.message : String(error) }
            );

            return createWorkspaceSnapshot({
                ...options.getWorkspaceSnapshot?.(),
                providerId: options.getSnapshot().providerId,
                status: "uncertain",
                message
            });
        }
    };

    return {
        listWorkspaceObjects,
        removeWorkspaceObjects: async function(objectNames) {
            const snapshot = options.getSnapshot();
            const generation = options.getWorkspaceGeneration?.();
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
                return createWorkspaceSnapshot(createUnsupportedOperationResult({
                    providerId: snapshot.providerId,
                    objects: (await listWorkspaceObjects()).objects,
                    message: "Selected workspace object(s) cannot be removed by this provider."
                }));
            }

            const result = await performWorkspaceMutation("remove", () => {
                return options.workspaceMutationController.remove(names);
            });

            if (generation !== options.getWorkspaceGeneration?.()) {
                return unavailable();
            }
            const workspace = acceptMutationWorkspace(result);

            if (workspace.status !== "ready") {
                return workspace;
            }

            options.activeDatasetController.clearIfRemoved(names.filter((name) => {
                return !workspace.objects.some((object) => object.name === name);
            }));
            options.recordRuntimeEvent(
                "workspace.object.removed",
                names.join(", "),
                "Workspace object(s) removed.",
                { objectNames: names }
            );

            return createWorkspaceSnapshot({
                ...workspace,
                message: "Workspace object(s) removed."
            });
        },
        renameWorkspaceObject: async function(request) {
            const snapshot = options.getSnapshot();
            const generation = options.getWorkspaceGeneration?.();
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
                const workspace = await listWorkspaceObjects();

                if (workspace.status !== "ready") {
                    return workspace;
                }

                return createWorkspaceSnapshot({
                    ...workspace,
                    message: "Workspace object already has the requested name."
                });
            }

            const currentWorkspace = await listWorkspaceObjects();

            if (generation !== options.getWorkspaceGeneration?.()) {
                return unavailable();
            }
            if (currentWorkspace.status !== "ready") {
                return currentWorkspace;
            }
            const currentObjects = currentWorkspace.objects;
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
                return createWorkspaceSnapshot(createUnsupportedOperationResult({
                    providerId: snapshot.providerId,
                    objects: (await listWorkspaceObjects()).objects,
                    message: "Selected workspace object cannot be renamed by this provider."
                }));
            }

            const result = await performWorkspaceMutation("rename", () => {
                return options.workspaceMutationController.rename({
                    oldName,
                    newName,
                    source: request.source
                });
            });

            if (generation !== options.getWorkspaceGeneration?.()) {
                return unavailable();
            }
            const workspace = acceptMutationWorkspace(result);

            if (workspace.status !== "ready") {
                return workspace;
            }

            if (
                !workspace.objects.some((object) => object.name === oldName)
                && workspace.objects.some((object) => object.name === newName)
            ) {
                options.activeDatasetController.rename(oldName, newName);
            }
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
                ...workspace,
                message: "Workspace object renamed."
            });
        },
        clearWorkspace: async function() {
            const snapshot = options.getSnapshot();
            const generation = options.getWorkspaceGeneration?.();

            if (snapshot.status !== "ready") {
                return unavailable();
            }

            const previousWorkspace = await listWorkspaceObjects();

            if (generation !== options.getWorkspaceGeneration?.()) {
                return unavailable();
            }
            if (previousWorkspace.status !== "ready") {
                return previousWorkspace;
            }
            const previousNames = previousWorkspace.objects.map((object) => object.name);
            const result = await performWorkspaceMutation("clear", () => {
                return options.workspaceMutationController.clear();
            });

            if (generation !== options.getWorkspaceGeneration?.()) {
                return unavailable();
            }
            const workspace = acceptMutationWorkspace(result);

            if (workspace.status !== "ready") {
                return workspace;
            }

            options.activeDatasetController.clearIfRemoved(previousNames.filter((name) => {
                return !workspace.objects.some((object) => object.name === name);
            }));
            options.recordRuntimeEvent(
                "workspace.cleared",
                "",
                "Workspace cleared.",
                { objectNames: previousNames }
            );

            return createWorkspaceSnapshot({
                ...workspace,
                message: "Workspace cleared."
            });
        }
    };
};

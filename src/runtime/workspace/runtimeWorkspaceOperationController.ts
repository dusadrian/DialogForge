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
    removeWorkspaceObjects(
        objectNames: string[],
        ownership?: WorkspaceMutationOwnership
    ): Promise<WorkspaceSnapshot>;
    renameWorkspaceObject(
        request: WorkspaceRenameRequest,
        ownership?: WorkspaceMutationOwnership
    ): Promise<WorkspaceSnapshot>;
    clearWorkspace(ownership?: WorkspaceMutationOwnership): Promise<WorkspaceSnapshot>;
}


export interface WorkspaceMutationOwnership {
    begin(): void;
    readWorkspace(): WorkspaceSnapshot;
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
        const selectionRevision = options.activeDatasetController
            .getActiveDataset().selectionRevision;
        const workspace = await options.workspaceListController.list(
            listOptions
        );

        if (generation !== options.getWorkspaceGeneration?.()) {
            return unavailable();
        }

        if (workspace.status !== "ready") {
            return workspace;
        }
        const remembered = options.activeDatasetController.rememberWorkspaceSnapshot(
            workspace.objects,
            workspace.workspaceRevision
        );

        const acceptedWorkspace = options.getWorkspaceSnapshot?.() || remembered.snapshot;

        if (!remembered.accepted || acceptedWorkspace.status !== "ready") {
            return acceptedWorkspace;
        }

        const currentSelectionRevision = options.activeDatasetController
            .getActiveDataset().selectionRevision;

        // A read can refresh objects without owning a newer explicit selection.
        if (
            selectionRevision?.owner === currentSelectionRevision?.owner
            && selectionRevision?.sequence === currentSelectionRevision?.sequence
        ) {
            options.activeDatasetController.reconcileAfterWorkspaceRefresh(
                acceptedWorkspace.objects,
                "workspace-refresh"
            );
        }

        return createWorkspaceSnapshot({
            ...acceptedWorkspace,
            message: workspace.message
        });
    };

    const acceptMutationWorkspace = function(
        result: WorkspaceSnapshot | WorkspaceObjectSnapshot[],
        ownership?: WorkspaceMutationOwnership
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

        return ownership?.readWorkspace() || options.getWorkspaceSnapshot?.() || createWorkspaceSnapshot({
            ...workspace,
            objects
        });
    };

    const performWorkspaceMutation = async function(
        operation: "remove" | "rename" | "clear",
        mutate: () => Promise<WorkspaceSnapshot | WorkspaceObjectSnapshot[]>,
        ownership?: WorkspaceMutationOwnership
    ): Promise<WorkspaceSnapshot | WorkspaceObjectSnapshot[]> {
        const generation = options.getWorkspaceGeneration?.();

        try {
            ownership?.begin();
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
                ...(ownership?.readWorkspace() || options.getWorkspaceSnapshot?.()),
                providerId: options.getSnapshot().providerId,
                status: "uncertain",
                message
            });
        }
    };

    return {
        listWorkspaceObjects,
        removeWorkspaceObjects: async function(objectNames, ownership) {
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
            }, ownership);

            if (generation !== options.getWorkspaceGeneration?.()) {
                return unavailable();
            }
            const workspace = acceptMutationWorkspace(result, ownership);

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
        renameWorkspaceObject: async function(request, ownership) {
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
            }, ownership);

            if (generation !== options.getWorkspaceGeneration?.()) {
                return unavailable();
            }
            const workspace = acceptMutationWorkspace(result, ownership);

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
        clearWorkspace: async function(ownership) {
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
            }, ownership);

            if (generation !== options.getWorkspaceGeneration?.()) {
                return unavailable();
            }
            const workspace = acceptMutationWorkspace(result, ownership);

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

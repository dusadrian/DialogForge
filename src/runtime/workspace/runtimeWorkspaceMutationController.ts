import type {
    RuntimeSessionSnapshot,
    RuntimeWorkspaceController,
    WorkspaceObjectSnapshot,
    WorkspaceRenameRequest,
    WorkspaceSnapshot
} from "../provider-contract/runtimeProvider";
import type {
    RuntimeFallbackTabularState
} from "../session/runtimeFallbackTabularState";


export interface RuntimeWorkspaceMutationControllerOptions {
    providerWorkspaceController?: RuntimeWorkspaceController;
    fallbackState: RuntimeFallbackTabularState;
    listProviderObjects(): WorkspaceObjectSnapshot[];
    listImportedTables(): WorkspaceObjectSnapshot[];
    getSnapshot(): RuntimeSessionSnapshot;
    getWorkspaceGeneration(): number;
    markWorkspaceStale(requireSnapshot?: boolean): void;
}


export interface RuntimeWorkspaceMutationController {
    canFallbackRemove(objectNames: string[]): boolean;
    remove(objectNames: string[]): Promise<WorkspaceSnapshot | WorkspaceObjectSnapshot[]>;
    canFallbackRename(objectName: string): boolean;
    rename(request: WorkspaceRenameRequest): Promise<WorkspaceSnapshot | WorkspaceObjectSnapshot[]>;
    clear(): Promise<WorkspaceSnapshot | WorkspaceObjectSnapshot[]>;
}


export const createRuntimeWorkspaceMutationController = function(
    options: RuntimeWorkspaceMutationControllerOptions
): RuntimeWorkspaceMutationController {
    const listComposedObjects = function(): WorkspaceObjectSnapshot[] {
        return options.listProviderObjects().concat(
            options.listImportedTables()
        );
    };

    const runWorkspaceMutation = async function(
        mutate: () => Promise<WorkspaceSnapshot | WorkspaceObjectSnapshot[]>
    ): Promise<WorkspaceSnapshot | WorkspaceObjectSnapshot[]> {
        const generation = options.getWorkspaceGeneration();

        try {
            return await mutate();
        }
        catch (error) {
            // The provider may have applied the edit before its snapshot failed.
            // Preserve the error and do not retry a potentially completed edit.
            if (generation === options.getWorkspaceGeneration()) {
                options.markWorkspaceStale(true);
            }

            throw error;
        }
    };

    return {
        canFallbackRemove: function(objectNames): boolean {
            return objectNames.every((name) => {
                return options.fallbackState.has(name);
            });
        },
        remove: function(objectNames) {
            return runWorkspaceMutation(async function() {
                if (options.providerWorkspaceController?.removeWorkspaceObjects) {
                    return options.providerWorkspaceController.removeWorkspaceObjects(
                        objectNames,
                        options.getSnapshot()
                    );
                }

                objectNames.forEach((name) => {
                    options.fallbackState.remove(name);
                });

                return listComposedObjects();
            });
        },
        canFallbackRename: function(objectName): boolean {
            return options.fallbackState.has(objectName);
        },
        rename: function(request) {
            return runWorkspaceMutation(async function() {
                if (options.providerWorkspaceController?.renameWorkspaceObject) {
                    return options.providerWorkspaceController.renameWorkspaceObject(
                        request,
                        options.getSnapshot()
                    );
                }

                options.fallbackState.move(request.oldName, request.newName);
                return listComposedObjects();
            });
        },
        clear: function() {
            return runWorkspaceMutation(async function() {
                if (options.providerWorkspaceController?.clearWorkspace) {
                    return options.providerWorkspaceController.clearWorkspace(
                        options.getSnapshot()
                    );
                }

                options.fallbackState.clear();
                return options.listProviderObjects();
            });
        }
    };
};

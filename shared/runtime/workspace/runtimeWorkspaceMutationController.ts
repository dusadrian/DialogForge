import type {
    RuntimeSessionSnapshot,
    RuntimeWorkspaceController,
    WorkspaceObjectSnapshot,
    WorkspaceRenameRequest
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
}


export interface RuntimeWorkspaceMutationController {
    canFallbackRemove(objectNames: string[]): boolean;
    remove(objectNames: string[]): Promise<WorkspaceObjectSnapshot[]>;
    canFallbackRename(objectName: string): boolean;
    rename(request: WorkspaceRenameRequest): Promise<WorkspaceObjectSnapshot[]>;
    clear(): Promise<WorkspaceObjectSnapshot[]>;
}


export const createRuntimeWorkspaceMutationController = function(
    options: RuntimeWorkspaceMutationControllerOptions
): RuntimeWorkspaceMutationController {
    const listComposedObjects = function(): WorkspaceObjectSnapshot[] {
        return options.listProviderObjects().concat(
            options.listImportedTables()
        );
    };

    return {
        canFallbackRemove: function(objectNames): boolean {
            return objectNames.every((name) => {
                return options.fallbackState.has(name);
            });
        },
        remove: async function(objectNames) {
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
        },
        canFallbackRename: function(objectName): boolean {
            return options.fallbackState.has(objectName);
        },
        rename: async function(request) {
            if (options.providerWorkspaceController?.renameWorkspaceObject) {
                return options.providerWorkspaceController.renameWorkspaceObject(
                    request,
                    options.getSnapshot()
                );
            }

            options.fallbackState.move(request.oldName, request.newName);
            return listComposedObjects();
        },
        clear: async function() {
            if (options.providerWorkspaceController?.clearWorkspace) {
                return options.providerWorkspaceController.clearWorkspace(
                    options.getSnapshot()
                );
            }

            options.fallbackState.clear();
            return options.listProviderObjects();
        }
    };
};

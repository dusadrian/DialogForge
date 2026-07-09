import type {
    ActiveDatasetSnapshot,
    RuntimeSessionSnapshot,
    WorkspaceObjectSnapshot
} from "../provider-contract/runtimeProvider";
import type {
    RuntimeWorkspaceState
} from "./runtimeWorkspaceState";


export interface RuntimeActiveDatasetControllerOptions {
    workspaceState: RuntimeWorkspaceState;
    getSnapshot(): RuntimeSessionSnapshot;
    recordRuntimeEvent(
        type: string,
        objectName: string,
        detail: string,
        payload: Record<string, unknown>
    ): void;
}


export interface RuntimeActiveDatasetController {
    rememberWorkspaceObjects(objects: WorkspaceObjectSnapshot[]): WorkspaceObjectSnapshot[];
    reconcileAfterWorkspaceRefresh(
        objects: WorkspaceObjectSnapshot[],
        reason: string
    ): void;
    selectFromWorkspace(
        objects: WorkspaceObjectSnapshot[],
        objectName: string,
        reason: string
    ): void;
    selectKnown(objectName: string, reason: string): void;
    clearIfRemoved(objectNames: string[]): void;
    rename(oldName: string, newName: string): void;
    getActiveDataset(): ActiveDatasetSnapshot;
    setActiveDataset(objectName: string): ActiveDatasetSnapshot;
}


const isReadableTabularObject = function(
    object: WorkspaceObjectSnapshot
): boolean {
    return object.capabilities.includes("tabular.read");
};


export const createRuntimeActiveDatasetController = function(
    options: RuntimeActiveDatasetControllerOptions
): RuntimeActiveDatasetController {
    const providerId = function(): string {
        return options.getSnapshot().providerId;
    };

    const recordSelection = function(
        objectName: string,
        detail: string,
        payload: Record<string, unknown>
    ): void {
        options.recordRuntimeEvent(
            "workspace.activeDataset.selected",
            objectName,
            detail,
            payload
        );
    };

    const reconcileAfterWorkspaceRefresh = function(
        objects: WorkspaceObjectSnapshot[],
        reason: string
    ): void {
        const selection = options.workspaceState.reconcile(
            providerId(),
            objects
        );

        if (!selection.changed || !selection.objectName) {
            return;
        }

        recordSelection(
            selection.objectName,
            "First available dataset selected.",
            {
                objectName: selection.objectName,
                reason
            }
        );
    };

    return {
        rememberWorkspaceObjects: function(objects) {
            return options.workspaceState.remember(objects);
        },
        reconcileAfterWorkspaceRefresh,
        selectFromWorkspace: function(objects, objectName, reason) {
            const found = objects.some((object) => {
                return object.name === objectName &&
                    isReadableTabularObject(object);
            });

            if (!found) {
                reconcileAfterWorkspaceRefresh(objects, reason);
                return;
            }

            options.workspaceState.select(
                providerId(),
                objects,
                objectName
            );
            recordSelection(
                objectName,
                "Active dataset selected.",
                {
                    objectName,
                    reason
                }
            );
        },
        selectKnown: function(objectName, reason) {
            options.workspaceState.selectKnown(providerId(), objectName);
            recordSelection(
                objectName,
                "Active dataset selected.",
                {
                    objectName,
                    reason
                }
            );
        },
        clearIfRemoved: function(objectNames) {
            options.workspaceState.clearIfRemoved(providerId(), objectNames);
        },
        rename: function(oldName, newName) {
            options.workspaceState.rename(providerId(), oldName, newName);
        },
        getActiveDataset: function() {
            return options.workspaceState.getActiveDataset();
        },
        setActiveDataset: function(objectName) {
            const snapshot = options.getSnapshot();

            if (snapshot.status !== "ready") {
                options.workspaceState.setUnavailable(
                    snapshot.providerId,
                    objectName
                );

                return options.workspaceState.getActiveDataset();
            }

            const activeDataset = options.workspaceState.getActiveDataset();

            if (
                activeDataset.status === "selected" &&
                activeDataset.objectName === objectName
            ) {
                return options.workspaceState.getActiveDataset();
            }

            const workspaceObjects = options.workspaceState.getObjects();
            const found = workspaceObjects?.find((object) => {
                return object.name === objectName;
            });

            if (
                workspaceObjects !== null &&
                (!found || !isReadableTabularObject(found))
            ) {
                options.workspaceState.setInvalid(
                    snapshot.providerId,
                    objectName
                );

                return options.workspaceState.getActiveDataset();
            }

            options.workspaceState.selectKnown(snapshot.providerId, objectName);
            recordSelection(
                objectName,
                "Active dataset selected.",
                { objectName }
            );

            return options.workspaceState.getActiveDataset();
        }
    };
};

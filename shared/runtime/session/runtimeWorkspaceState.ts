import {
    createActiveDatasetSnapshot,
    createWorkspaceSnapshot
} from "../workspace/workspaceProtocol";
import type {
    ActiveDatasetSnapshot,
    RuntimeSessionSnapshot,
    WorkspaceObjectSnapshot,
    WorkspaceSnapshot
} from "../provider-contract/runtimeProvider";


export interface RuntimeWorkspaceSelection {
    changed: boolean;
    objectName: string;
}


export interface RuntimeWorkspaceState {
    invalidate(): void;
    remember(objects: WorkspaceObjectSnapshot[]): WorkspaceObjectSnapshot[];
    getObjects(): WorkspaceObjectSnapshot[] | null;
    createSnapshot(session: RuntimeSessionSnapshot): WorkspaceSnapshot;
    getActiveDataset(): ActiveDatasetSnapshot;
    getActiveObjectName(): string;
    reconcile(
        providerId: string,
        objects: WorkspaceObjectSnapshot[]
    ): RuntimeWorkspaceSelection;
    select(
        providerId: string,
        objects: WorkspaceObjectSnapshot[],
        objectName: string
    ): RuntimeWorkspaceSelection;
    selectKnown(providerId: string, objectName: string): RuntimeWorkspaceSelection;
    setUnavailable(providerId: string, objectName: string): void;
    setInvalid(providerId: string, objectName: string): void;
    clearIfRemoved(providerId: string, objectNames: string[]): void;
    rename(providerId: string, oldName: string, newName: string): void;
}


const cloneWorkspaceObjects = function(
    objects: WorkspaceObjectSnapshot[]
): WorkspaceObjectSnapshot[] {
    return objects.map((object) => {
        return Object.assign({}, object, {
            capabilities: object.capabilities.slice()
        });
    });
};


const isReadableTabularObject = function(
    object: WorkspaceObjectSnapshot
): boolean {
    return object.capabilities.includes("tabular.read");
};


export const createRuntimeWorkspaceState = function(
    providerId: string
): RuntimeWorkspaceState {
    let objects: WorkspaceObjectSnapshot[] | null = null;
    let activeDataset = createActiveDatasetSnapshot({
        status: "none",
        providerId,
        message: "No active dataset is selected."
    });

    const selectKnown = function(
        nextProviderId: string,
        objectName: string
    ): RuntimeWorkspaceSelection {
        const changed =
            activeDataset.status !== "selected" ||
            activeDataset.objectName !== objectName;

        activeDataset = createActiveDatasetSnapshot({
            status: "selected",
            providerId: nextProviderId,
            objectName,
            message: "Active dataset selected.",
            selectedAt: new Date().toISOString()
        });

        return {
            changed,
            objectName
        };
    };

    const reconcile = function(
        nextProviderId: string,
        nextObjects: WorkspaceObjectSnapshot[]
    ): RuntimeWorkspaceSelection {
        const activeIsAvailable =
            activeDataset.status === "selected" &&
            nextObjects.some((object) => {
                return object.name === activeDataset.objectName &&
                    isReadableTabularObject(object);
            });

        if (activeIsAvailable) {
            return {
                changed: false,
                objectName: activeDataset.objectName
            };
        }

        if (activeDataset.status === "selected") {
            activeDataset = createActiveDatasetSnapshot({
                status: "none",
                providerId: nextProviderId,
                message: "The active dataset is no longer available in the workspace."
            });

            return {
                changed: false,
                objectName: ""
            };
        }

        const firstDataset = nextObjects.find(isReadableTabularObject);

        if (!firstDataset) {
            return {
                changed: false,
                objectName: ""
            };
        }

        const selection = selectKnown(nextProviderId, firstDataset.name);
        activeDataset = createActiveDatasetSnapshot({
            status: "selected",
            providerId: nextProviderId,
            objectName: firstDataset.name,
            message: "First available dataset selected.",
            selectedAt: activeDataset.selectedAt
        });

        return selection;
    };

    return {
        invalidate: function(): void {
            objects = null;
        },
        remember: function(nextObjects) {
            objects = cloneWorkspaceObjects(nextObjects);

            return nextObjects;
        },
        getObjects: function() {
            return objects === null ? null : cloneWorkspaceObjects(objects);
        },
        createSnapshot: function(session) {
            return createWorkspaceSnapshot({
                status: session.status === "ready" && objects !== null
                    ? "ready"
                    : "unavailable",
                providerId: session.providerId,
                objects: cloneWorkspaceObjects(objects || []),
                message: objects !== null
                    ? "Last workspace objects read from the runtime provider."
                    : "Workspace objects have not been read from the runtime provider."
            });
        },
        getActiveDataset: function() {
            return Object.assign({}, activeDataset);
        },
        getActiveObjectName: function(): string {
            return activeDataset.objectName;
        },
        reconcile,
        select: function(nextProviderId, nextObjects, objectName) {
            const found = nextObjects.find((object) => {
                return object.name === objectName &&
                    isReadableTabularObject(object);
            });

            return found
                ? selectKnown(nextProviderId, found.name)
                : reconcile(nextProviderId, nextObjects);
        },
        selectKnown,
        setUnavailable: function(nextProviderId, objectName): void {
            activeDataset = createActiveDatasetSnapshot({
                status: "unavailable",
                providerId: nextProviderId,
                objectName,
                message: "Runtime session is not ready."
            });
        },
        setInvalid: function(nextProviderId, objectName): void {
            activeDataset = createActiveDatasetSnapshot({
                status: "invalid",
                providerId: nextProviderId,
                objectName,
                message: "Selected object is not a readable tabular object."
            });
        },
        clearIfRemoved: function(nextProviderId, objectNames): void {
            if (!objectNames.includes(activeDataset.objectName)) {
                return;
            }

            activeDataset = createActiveDatasetSnapshot({
                status: "none",
                providerId: nextProviderId,
                message: "The active dataset was removed from the workspace."
            });
        },
        rename: function(nextProviderId, oldName, newName): void {
            if (
                activeDataset.status !== "selected" ||
                activeDataset.objectName !== oldName
            ) {
                return;
            }

            activeDataset = createActiveDatasetSnapshot({
                status: "selected",
                providerId: nextProviderId,
                objectName: newName,
                message: "Active dataset renamed.",
                selectedAt: new Date().toISOString()
            });
        }
    };
};

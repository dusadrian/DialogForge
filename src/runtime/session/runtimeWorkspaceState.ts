import {
    createActiveDatasetSnapshot,
    createWorkspaceSnapshot
} from "../workspace/workspaceProtocol";
import type {
    ActiveDatasetSnapshot,
    RuntimeSessionSnapshot,
    WorkspaceObjectSnapshot,
    WorkspaceSnapshot,
    WorkspaceUpdate
} from "../provider-contract/runtimeProvider";
import {
    applyWorkspaceUpdateToObjects
} from "../workspace/workspaceUpdate";


export interface RuntimeWorkspaceSelection {
    changed: boolean;
    objectName: string;
}


export interface RuntimeWorkspaceState {
    invalidate(): void;
    getGeneration(): number;
    markStale(requireSnapshot?: boolean): void;
    needsFullSnapshot(): boolean;
    remember(
        objects: WorkspaceObjectSnapshot[],
        revision?: WorkspaceUpdate["workspaceRevision"]
    ): WorkspaceObjectSnapshot[];
    applyUpdate(update: WorkspaceUpdate): WorkspaceObjectSnapshot[];
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
    let stale = false;
    let requiresSnapshot = false;
    let generation = 0;
    let revision: WorkspaceUpdate["workspaceRevision"];
    const retiredSessions = new Set<string>();
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
            generation += 1;
            if (revision) {
                retiredSessions.add(revision.session);
            }
            revision = undefined;
            stale = false;
            requiresSnapshot = false;
            objects = null;
        },
        getGeneration: function() {
            return generation;
        },
        markStale: function(requireSnapshot = false): void {
            // Retain the last baseline so a later committed delta can recover it.
            stale = true;
            requiresSnapshot = requiresSnapshot || requireSnapshot;
        },
        needsFullSnapshot: function(): boolean {
            return requiresSnapshot;
        },
        remember: function(nextObjects, nextRevision) {
            if (nextRevision) {
                // A snapshot from before a failed check cannot prove recovery.
                // Recovery must carry a later authoritative commit receipt.
                if (
                    retiredSessions.has(nextRevision.session)
                    || (revision && revision.session !== nextRevision.session)
                    || (revision?.session === nextRevision.session
                        && nextRevision.sequence < revision.sequence)
                    || (stale && revision?.session === nextRevision.session
                        && nextRevision.sequence === revision.sequence)
                ) {
                    return cloneWorkspaceObjects(objects || []);
                }
                revision = nextRevision;
            }
            objects = cloneWorkspaceObjects(nextObjects);
            stale = false;
            requiresSnapshot = false;

            return nextObjects;
        },
        applyUpdate: function(update) {
            // An uncertain mutation may have committed a delta we never received.
            // A later empty delta cannot repair that missing baseline.
            if (requiresSnapshot) {
                return cloneWorkspaceObjects(objects || []);
            }
            const nextRevision = update.workspaceRevision;

            if (nextRevision) {
                if (
                    retiredSessions.has(nextRevision.session)
                    || (revision?.session === nextRevision.session
                        && nextRevision.sequence <= revision.sequence)
                ) {
                    return cloneWorkspaceObjects(objects || []);
                }

                if (revision && revision.session !== nextRevision.session) {
                    // A different session is admitted only after lifecycle
                    // invalidation, never by a delayed event alone.
                    return cloneWorkspaceObjects(objects || []);
                }
                revision = nextRevision;
            }

            objects = applyWorkspaceUpdateToObjects(objects || [], update);

            if (update.workspaceRevision) {
                stale = false;
            }

            return cloneWorkspaceObjects(objects);
        },
        getObjects: function() {
            return objects === null || stale ? null : cloneWorkspaceObjects(objects);
        },
        createSnapshot: function(session) {
            return createWorkspaceSnapshot({
                status: session.status === "ready" && objects !== null && !stale
                    ? "ready"
                    : "unavailable",
                providerId: session.providerId,
                objects: cloneWorkspaceObjects(objects || []),
                workspaceRevision: revision,
                message: stale
                    ? "Workspace refresh failed; displayed values may be stale."
                    : objects !== null
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

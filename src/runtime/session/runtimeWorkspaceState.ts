import {
    createActiveDatasetSnapshot,
    createWorkspaceSnapshot
} from "../workspace/workspaceProtocol";
import type {
    ActiveDatasetSnapshot,
    RuntimeSessionSnapshot,
    WorkspaceObjectSnapshot,
    WorkspaceFreshness,
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


export interface RuntimeWorkspaceSnapshotAcceptance {
    accepted: boolean;
    objects: WorkspaceObjectSnapshot[];
}


export interface RuntimeWorkspaceState {
    invalidate(): void;
    getGeneration(): number;
    getReadEpoch(): number;
    beginCommandReconciliation(): number;
    endCommandReconciliation(token: number): void;
    markStale(requireSnapshot?: boolean): void;
    needsFullSnapshot(): boolean;
    remember(
        objects: WorkspaceObjectSnapshot[],
        revision?: WorkspaceUpdate["workspaceRevision"]
    ): WorkspaceObjectSnapshot[];
    rememberSnapshot(
        objects: WorkspaceObjectSnapshot[],
        revision?: WorkspaceUpdate["workspaceRevision"]
    ): RuntimeWorkspaceSnapshotAcceptance;
    canApplyUpdate(update: WorkspaceUpdate): boolean;
    applyUpdate(update: WorkspaceUpdate): WorkspaceObjectSnapshot[];
    getObjects(): WorkspaceObjectSnapshot[] | null;
    createSnapshot(session: RuntimeSessionSnapshot, excludedToken?: number): WorkspaceSnapshot;
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
    clearSelection(providerId: string): void;
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


let workspaceOwnerSequence = 0;


export const createRuntimeWorkspaceState = function(
    providerId: string
): RuntimeWorkspaceState {
    const selectionOwner = [
        Date.now(), ++workspaceOwnerSequence, Math.random().toString(36).slice(2)
    ].join("-");
    let selectionSequence = 0;
    const createSelectionSnapshot = function(
        input: Partial<ActiveDatasetSnapshot>
    ): ActiveDatasetSnapshot {
        return createActiveDatasetSnapshot({
            ...input,
            selectionRevision: {
                owner: selectionOwner,
                sequence: ++selectionSequence
            }
        });
    };

    let stale = false;
    let requiresSnapshot = false;
    let generation = 0;
    let readEpoch = 0;
    let revision: WorkspaceUpdate["workspaceRevision"];
    const retiredSessions = new Set<string>();
    let objects: WorkspaceObjectSnapshot[] | null = null;
    let reconciliationSequence = 0;
    const pendingCommandReconciliations = new Set<number>();
    let activeDataset = createSelectionSnapshot({
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

        activeDataset = createSelectionSnapshot({
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
            activeDataset = createSelectionSnapshot({
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
        activeDataset = createSelectionSnapshot({
            status: "selected",
            providerId: nextProviderId,
            objectName: firstDataset.name,
            message: "First available dataset selected.",
            selectedAt: activeDataset.selectedAt
        });

        return selection;
    };

    const canApplyUpdate = function(update: WorkspaceUpdate): boolean {
        // A delta cannot repair a mutation whose committed result was lost.
        if (requiresSnapshot) {
            return false;
        }

        const nextRevision = update.workspaceRevision;

        if (!nextRevision) {
            return true;
        }

        return !retiredSessions.has(nextRevision.session)
            && (!revision || (
                revision.session === nextRevision.session
                && nextRevision.sequence > revision.sequence
            ));
    };

    const rememberSnapshot = function(
        nextObjects: WorkspaceObjectSnapshot[],
        nextRevision?: WorkspaceUpdate["workspaceRevision"]
    ): RuntimeWorkspaceSnapshotAcceptance {
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
                return {
                    accepted: false,
                    objects: cloneWorkspaceObjects(objects || [])
                };
            }
            revision = nextRevision;
        }
        readEpoch += 1;
        objects = cloneWorkspaceObjects(nextObjects);
        stale = false;
        requiresSnapshot = false;

        return { accepted: true, objects: nextObjects };
    };

    return {
        invalidate: function(): void {
            generation += 1;
            // Keep restart restoration intent, but retire pre-lifecycle reads.
            activeDataset = createSelectionSnapshot(activeDataset);
            readEpoch += 1;
            pendingCommandReconciliations.clear();
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
        getReadEpoch: function() {
            return readEpoch;
        },
        beginCommandReconciliation: function(): number {
            readEpoch += 1;
            reconciliationSequence += 1;
            pendingCommandReconciliations.add(reconciliationSequence);

            return reconciliationSequence;
        },
        endCommandReconciliation: function(token): void {
            pendingCommandReconciliations.delete(token);
        },
        markStale: function(requireSnapshot = false): void {
            readEpoch += 1;
            // Retain the last baseline so a later committed delta can recover it.
            stale = true;
            requiresSnapshot = requiresSnapshot || requireSnapshot;
        },
        needsFullSnapshot: function(): boolean {
            return requiresSnapshot;
        },
        remember: function(nextObjects, nextRevision) {
            return rememberSnapshot(nextObjects, nextRevision).objects;
        },
        rememberSnapshot,
        canApplyUpdate,
        applyUpdate: function(update) {
            if (!canApplyUpdate(update)) {
                return cloneWorkspaceObjects(objects || []);
            }
            const nextRevision = update.workspaceRevision;

            if (nextRevision) {
                revision = nextRevision;
            }

            readEpoch += 1;
            objects = applyWorkspaceUpdateToObjects(objects || [], update);

            if (update.workspaceRevision) {
                stale = false;
            }

            return cloneWorkspaceObjects(objects);
        },
        getObjects: function() {
            if (objects === null || stale || pendingCommandReconciliations.size > 0) {
                return null;
            }

            return cloneWorkspaceObjects(objects);
        },
        createSnapshot: function(session, excludedToken) {
            let freshness: WorkspaceFreshness;
            const pendingCount = pendingCommandReconciliations.size
                - (excludedToken !== undefined && pendingCommandReconciliations.has(excludedToken) ? 1 : 0);

            if (session.status !== "ready") {
                freshness = "unavailable";
            }
            else if (pendingCount > 0) {
                freshness = "pending";
            }
            else if (stale) {
                freshness = "stale";
            }
            else {
                freshness = objects === null ? "unread" : "fresh";
            }

            return createWorkspaceSnapshot({
                status: freshness === "fresh" ? "ready" : "unavailable",
                freshness,
                providerId: session.providerId,
                objects: cloneWorkspaceObjects(objects || []),
                workspaceRevision: revision,
                message: freshness === "pending"
                    ? "Workspace synchronization is pending for an active command."
                    : freshness === "unavailable"
                    ? "Runtime session is not ready."
                    : stale
                    ? "Workspace refresh failed; displayed values may be stale."
                    : objects !== null
                    ? "Last workspace objects read from the runtime provider."
                    : "Workspace objects have not been read from the runtime provider."
            });
        },
        getActiveDataset: function() {
            return createActiveDatasetSnapshot(activeDataset);
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
            activeDataset = createSelectionSnapshot({
                status: "unavailable",
                providerId: nextProviderId,
                objectName,
                message: "Runtime session is not ready."
            });
        },
        setInvalid: function(nextProviderId, objectName): void {
            activeDataset = createSelectionSnapshot({
                status: "invalid",
                providerId: nextProviderId,
                objectName,
                message: "Selected object is not a readable tabular object."
            });
        },
        clearSelection: function(nextProviderId): void {
            activeDataset = createSelectionSnapshot({
                status: "none",
                providerId: nextProviderId,
                message: "No active dataset is selected."
            });
        },
        clearIfRemoved: function(nextProviderId, objectNames): void {
            if (!objectNames.includes(activeDataset.objectName)) {
                return;
            }

            activeDataset = createSelectionSnapshot({
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

            activeDataset = createSelectionSnapshot({
                status: "selected",
                providerId: nextProviderId,
                objectName: newName,
                message: "Active dataset renamed.",
                selectedAt: new Date().toISOString()
            });
        }
    };
};

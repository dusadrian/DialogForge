import type {
    RuntimeEventRecord,
    RuntimeEventSnapshot,
    WorkspaceSnapshot
} from "../../../runtime/provider-contract/runtimeProvider";
import {
    applyWorkspaceUpdateToObjects,
    createWorkspaceUpdate
} from "../../../runtime/workspace/workspaceUpdate";
import {
    readLatestAddedWorkspaceDataset
} from "../../../runtime/workspace/workspaceDatasetSelection";


export interface WorkspaceRuntimeEventControllerBindings {
    getWorkspaceSnapshot(): WorkspaceSnapshot | null;
    getRuntimeProviderId(): string;
    renderWorkspace(snapshot: WorkspaceSnapshot): void;
    setActiveDataset(objectName: string): Promise<void>;
}


export interface WorkspaceRuntimeEventController {
    applySnapshot(snapshot: RuntimeEventSnapshot): void;
}


const maximumAppliedEventKeys = 160;


export const createWorkspaceRuntimeEventController = function(
    bindings: WorkspaceRuntimeEventControllerBindings
): WorkspaceRuntimeEventController {
    const appliedEventKeys = new Set<string>();
    const appliedEventKeyOrder: string[] = [];

    const rememberAppliedEventKey = function(eventKey: string): void {
        appliedEventKeys.add(eventKey);
        appliedEventKeyOrder.push(eventKey);

        while (appliedEventKeyOrder.length > maximumAppliedEventKeys) {
            const expiredKey = appliedEventKeyOrder.shift();

            if (expiredKey) {
                appliedEventKeys.delete(expiredKey);
            }
        }
    };

    const applyEvent = function(event: RuntimeEventRecord): void {
        if (event.type !== "workspace.update") {
            return;
        }

        const eventKey = [
            event.type,
            event.createdAt,
            event.detail,
            JSON.stringify(event.payload || {})
        ].join("\n");

        if (appliedEventKeys.has(eventKey)) {
            return;
        }

        const snapshot = bindings.getWorkspaceSnapshot();
        const payload = event.payload || {};
        const update = createWorkspaceUpdate(payload);
        const revision = update.workspaceRevision;

        // Event history is a delta stream, not an authoritative recovery
        // snapshot. It cannot initialize or repair a versioned baseline.
        if (
            (snapshot && snapshot.status !== "ready")
            || (event.providerId && snapshot?.providerId
                && event.providerId !== snapshot.providerId)
            || (payload.workspaceRevision !== undefined && !revision)
        ) {
            return;
        }

        if (revision || snapshot?.workspaceRevision) {
            const currentRevision = snapshot?.workspaceRevision;

            if (
                !revision || !currentRevision
                || revision.session !== currentRevision.session
                || revision.sequence <= currentRevision.sequence
            ) {
                return;
            }
        }

        rememberAppliedEventKey(eventKey);

        const current = snapshot && snapshot.status === "ready"
            ? snapshot
            : {
                status: "ready",
                providerId: event.providerId || bindings.getRuntimeProviderId(),
                objects: [],
                message: "",
                refreshedAt: ""
            };
        const objects = applyWorkspaceUpdateToObjects(current.objects, update);
        const latestAddedDataset = readLatestAddedWorkspaceDataset(
            objects,
            update.added.map((object) => object.name)
        );

        bindings.renderWorkspace({
            status: "ready",
            ...(revision ? { workspaceRevision: revision } : {}),
            providerId: current.providerId
                || event.providerId
                || bindings.getRuntimeProviderId(),
            objects,
            message: String(payload.message || `${objects.length} objects`),
            refreshedAt: event.createdAt || new Date().toISOString()
        });

        if (latestAddedDataset) {
            void bindings.setActiveDataset(latestAddedDataset);
        }
    };

    const applySnapshot = function(snapshot: RuntimeEventSnapshot): void {
        if (snapshot.status !== "ready") {
            return;
        }
        snapshot.events.forEach(applyEvent);
    };

    return {
        applySnapshot
    };
};

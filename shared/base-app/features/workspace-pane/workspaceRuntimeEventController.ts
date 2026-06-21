import type {
    RuntimeCapability,
    RuntimeEventRecord,
    RuntimeEventSnapshot,
    WorkspaceObjectSnapshot,
    WorkspaceSnapshot
} from "../../../runtime/provider-contract/runtimeProvider";


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


const workspaceObjectName = function(value: unknown): string {
    if (!value || typeof value !== "object") {
        return "";
    }

    const record = value as Record<string, unknown>;

    return String(
        record.name || record.access_key || record.display_name || ""
    ).trim();
};


const isDatasetWorkspaceObject = function(value: unknown): boolean {
    if (!value || typeof value !== "object") {
        return false;
    }

    const record = value as Record<string, unknown>;
    const kind = String(
        record.kind || record.display_type || record.type_info || ""
    ).trim().toLowerCase();

    return kind === "table" || kind === "data.frame" || kind === "tibble";
};


const normalizeWorkspaceObject = function(
    value: unknown
): WorkspaceObjectSnapshot | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const record = value as Record<string, unknown>;
    const name = workspaceObjectName(record);

    if (!name) {
        return null;
    }

    const capabilities = Array.isArray(record.capabilities)
        ? record.capabilities.filter(
            (capability): capability is RuntimeCapability => {
                return typeof capability === "string";
            }
        )
        : [];

    return {
        name,
        kind: String(
            record.kind || record.display_type || record.type_info || "other"
        ).trim() || "other",
        detail: String(record.detail || record.display_value || "").trim(),
        hasViewer: Boolean(record.hasViewer || record.has_viewer),
        provenance: null,
        capabilities
    };
};


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

        rememberAppliedEventKey(eventKey);

        const snapshot = bindings.getWorkspaceSnapshot();
        const current = snapshot && snapshot.status === "ready"
            ? snapshot
            : {
                status: "ready",
                providerId: event.providerId || bindings.getRuntimeProviderId(),
                objects: [],
                message: "",
                refreshedAt: ""
            };
        const objectsByName = new Map<string, WorkspaceObjectSnapshot>();

        current.objects.forEach((entry) => {
            const name = workspaceObjectName(entry);

            if (name) {
                objectsByName.set(name, entry);
            }
        });

        const payload = event.payload || {};
        const added = Array.isArray(payload.added) ? payload.added : [];
        const updated = Array.isArray(payload.updated) ? payload.updated : [];
        const removed = Array.isArray(payload.removed) ? payload.removed : [];
        let latestAddedDataset = "";

        added.forEach((entry) => {
            const object = normalizeWorkspaceObject(entry);

            if (!object) {
                return;
            }

            if (isDatasetWorkspaceObject(entry)) {
                latestAddedDataset = object.name;
            }

            objectsByName.set(object.name, object);
        });

        updated.forEach((entry) => {
            const object = normalizeWorkspaceObject(entry);

            if (object) {
                objectsByName.set(object.name, object);
            }
        });

        removed.forEach((entry) => {
            const name = String(entry || "").trim();

            if (name) {
                objectsByName.delete(name);
            }
        });

        bindings.renderWorkspace({
            status: "ready",
            providerId: current.providerId
                || event.providerId
                || bindings.getRuntimeProviderId(),
            objects: Array.from(objectsByName.values()),
            message: String(payload.message || `${objectsByName.size} objects`),
            refreshedAt: event.createdAt || new Date().toISOString()
        });

        if (latestAddedDataset) {
            void bindings.setActiveDataset(latestAddedDataset);
        }
    };

    const applySnapshot = function(snapshot: RuntimeEventSnapshot): void {
        snapshot.events.forEach(applyEvent);
    };

    return {
        applySnapshot
    };
};

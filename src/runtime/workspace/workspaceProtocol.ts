import type {
    ActiveDatasetSnapshot,
    ObjectInspectionResult,
    WorkspaceRenameRequest,
    WorkspaceObjectSnapshot,
    WorkspaceSnapshot
} from "../provider-contract/runtimeProvider";


export const createWorkspaceSnapshot = function(input: Partial<WorkspaceSnapshot>): WorkspaceSnapshot {
    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        objects: input.objects || [],
        message: input.message || "",
        refreshedAt: new Date().toISOString()
    };
};


export const createWorkspaceObject = function(input: Partial<WorkspaceObjectSnapshot>): WorkspaceObjectSnapshot {
    const columns = Array.isArray(input.columns)
        ? input.columns.map((column) => String(column || "")).filter(Boolean)
        : [];
    const columnEntries = Array.isArray(input.columnEntries)
        ? input.columnEntries
            .map((entry) => {
                const record: Record<string, unknown> = entry && typeof entry === "object"
                    ? entry
                    : {};
                const name = String(record.name || "").trim();

                return name ? { ...record, name } : null;
            })
            .filter((entry): entry is Record<string, unknown> & { name: string } => Boolean(entry))
        : [];

    return {
        name: input.name || "",
        kind: input.kind || "",
        detail: input.detail || "",
        rows: Number(input.rows || 0) || 0,
        columns,
        columnEntries,
        hasViewer: input.hasViewer === true,
        provenance: input.provenance || null,
        capabilities: input.capabilities || []
    };
};


export const createWorkspaceRenameRequest = function(input: Partial<WorkspaceRenameRequest>): WorkspaceRenameRequest {
    return {
        oldName: String(input.oldName || "").trim(),
        newName: String(input.newName || "").trim(),
        source: String(input.source || "workspace.rename").trim()
    };
};


export const createActiveDatasetSnapshot = function(input: Partial<ActiveDatasetSnapshot>): ActiveDatasetSnapshot {
    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        objectName: input.objectName || "",
        message: input.message || "",
        selectedAt: input.selectedAt || ""
    };
};


export const createObjectInspectionResult = function(input: Partial<ObjectInspectionResult>): ObjectInspectionResult {
    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        objectName: input.objectName || "",
        kind: input.kind || "",
        detail: input.detail || "",
        capabilities: input.capabilities || [],
        summary: input.summary || [],
        message: input.message || "",
        inspectedAt: new Date().toISOString()
    };
};

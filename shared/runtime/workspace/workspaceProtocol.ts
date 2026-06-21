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
    return {
        name: input.name || "",
        kind: input.kind || "",
        detail: input.detail || "",
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

import type { ImportPlanRequest, ImportPlanResult, ImportRequest, ImportResult } from "../provider-contract/runtimeProvider";
import { inferImportFormat } from "./importFormat";
import { createImportTargetNameFromSource } from "./importNamePolicy";


export const createImportRequest = function(input: Partial<ImportRequest>): ImportRequest {
    return {
        source: String(input && input.source ? input.source : ""),
        format: String(input && input.format ? input.format : "auto"),
        targetName: String(input && input.targetName ? input.targetName : ""),
        overwrite: Boolean(input && input.overwrite),
        uiCommandVisibility: input.uiCommandVisibility === "visible" ? "visible" : "hidden",
        visibleCommandText: String(input.visibleCommandText || "")
    };
};


export const createImportPlanRequest = function(input: Partial<ImportPlanRequest>): ImportPlanRequest {
    return {
        source: String(input.source || ""),
        targetName: String(input.targetName || "")
    };
};


export const createImportPlanResult = function(input: Partial<ImportPlanResult>): ImportPlanResult {
    const source = String(input.source || "");

    return {
        status: String(input.status || "unknown"),
        source,
        format: String(input.format || inferImportFormat(source)),
        targetName: String(input.targetName || createImportTargetNameFromSource(source)),
        exists: Boolean(input.exists),
        sizeBytes: Number(input.sizeBytes || 0),
        message: String(input.message || ""),
        plannedAt: new Date().toISOString()
    };
};


export const createImportResult = function(input: Partial<ImportResult>): ImportResult {
    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        source: input.source || "",
        format: input.format || "auto",
        targetName: input.targetName || "",
        overwrite: Boolean(input.overwrite),
        transcriptEvents: input.transcriptEvents || [],
        workspaceUpdate: input.workspaceUpdate,
        message: input.message || "",
        importedAt: new Date().toISOString()
    };
};

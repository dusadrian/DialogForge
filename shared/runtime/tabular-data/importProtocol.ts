import * as path from "path";

import type { ImportPlanRequest, ImportPlanResult, ImportRequest, ImportResult } from "../provider-contract/runtimeProvider";
import { inferImportFormat } from "./importFormat";


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


const targetNameFromSource = function(source: string): string {
    const parsed = path.parse(source);
    const name = parsed.name || "imported_data";

    return name.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "imported_data";
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
        targetName: String(input.targetName || targetNameFromSource(source)),
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
        message: input.message || "",
        importedAt: new Date().toISOString()
    };
};

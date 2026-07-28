import {
    inferImportFormat
} from "./importFormat";
import {
    createImportTargetNameFromSource
} from "./importNamePolicy";
import {
    createImportPlanResult,
    createImportRequest
} from "./importProtocol";
import type {
    ImportPlanResult,
    ImportRequest
} from "../provider-contract/runtimeProvider";


export const createStagedImportRequest = function(
    input: Partial<ImportRequest>
): ImportRequest {
    const source = String(input?.source || "");
    const format = String(input?.format || inferImportFormat(source));
    const targetName = String(
        input?.targetName
        || createImportTargetNameFromSource(source)
    );

    return createImportRequest({
        ...input,
        source,
        format: format === "auto" ? inferImportFormat(source) : format,
        targetName
    });
};

export const createStagedImportPlanResult = function(
    input: {
        source?: unknown;
        targetName?: unknown;
        sizeBytes?: unknown;
    }
): ImportPlanResult {
    const source = String(input?.source || "");
    const targetName = String(
        input?.targetName
        || createImportTargetNameFromSource(source)
    );

    return createImportPlanResult({
        status: source ? "ready" : "empty",
        source,
        format: inferImportFormat(source),
        targetName,
        exists: false,
        sizeBytes: Number(input?.sizeBytes || 0),
        message: source ? "Browser import file staged." : "No file selected."
    });
};

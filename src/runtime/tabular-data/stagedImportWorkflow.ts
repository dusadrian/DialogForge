import {
    parseDelimitedTable
} from "./delimitedImport";
import {
    inferImportFormat
} from "./importFormat";
import {
    createImportTargetNameFromSource
} from "./importNamePolicy";
import {
    createDelimitedImportPreviewOptions,
    createImportPreviewFailureResult,
    createImportPreviewNotFoundResult,
    createImportPreviewResultFromDelimitedTable,
    createImportPreviewResultFromRuntimeJsonText,
    type ImportPreviewResult
} from "./importPreviewResult";
import {
    createImportPlanResult,
    createImportRequest
} from "./importProtocol";
import type {
    ImportPlanResult,
    ImportRequest
} from "../provider-contract/runtimeProvider";
import type {
    ImportPreviewRequest
} from "./importPreview";


export interface StagedImportRecord {
    filePath: string;
    sizeBytes?: number;
    readText(): Promise<string>;
    prepareRuntimePreview?(): Promise<void>;
}


export interface StagedImportRuntimePreviewBindings<Reader> {
    resolveRuntimePreviewReader(request: Partial<ImportPreviewRequest>): Reader | null;
    createRuntimePreviewCommand(
        filePath: string,
        nrows: unknown,
        reader: Reader
    ): string;
    readRuntimePreviewText(command: string): Promise<string>;
}


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


export const previewStagedImportFile = async function<Reader>(
    record: StagedImportRecord | null,
    request: Partial<ImportPreviewRequest>,
    bindings: StagedImportRuntimePreviewBindings<Reader>
): Promise<ImportPreviewResult> {
    if (!record) {
        return createImportPreviewNotFoundResult();
    }

    const reader = bindings.resolveRuntimePreviewReader(request);

    if (reader) {
        try {
            if (record.prepareRuntimePreview) {
                await record.prepareRuntimePreview();
            }

            const command = bindings.createRuntimePreviewCommand(
                record.filePath,
                request.nrows,
                reader
            );
            const text = String(await bindings.readRuntimePreviewText(command) || "").trim();

            return createImportPreviewResultFromRuntimeJsonText(text);
        }
        catch (error) {
            return createImportPreviewFailureResult(error, "error");
        }
    }

    const text = await record.readText();
    const table = parseDelimitedTable(
        text,
        "text",
        createDelimitedImportPreviewOptions(request)
    );

    return createImportPreviewResultFromDelimitedTable(table);
};

import * as fs from "fs";

import type {
    RuntimeExtensionMethodRequest,
    RuntimeExtensionMethodResult
} from "../provider-contract/runtimeProvider";
import { parseDelimitedTable } from "./delimitedImport";
import {
    createImportPreviewResult,
    createDelimitedImportPreviewOptions,
    createImportPreviewResultFromDelimitedTable,
    createImportPreviewNotFoundResult,
    createImportPreviewUnsupportedResult,
    type ImportPreviewResult
} from "./importPreviewResult";
import {
    isRuntimeImportPreviewRequest,
    type ImportPreviewRequest
} from "./importPreviewRequest";
import {
    previewImportFileThroughRuntime
} from "./runtimeImportPreview";


export {
    createImportPreviewResult,
    createImportPreviewResultFromRuntimeValue,
    createImportPreviewNotFoundResult,
    createImportPreviewUnsupportedResult,
    type ImportPreviewResult
} from "./importPreviewResult";
export {
    createImportPreviewRequest,
    isRuntimeImportPreviewRequest,
    type ImportPreviewRequest
} from "./importPreviewRequest";


export const previewImportFileWithRuntime = async function(
    input: Partial<ImportPreviewRequest>,
    executeRuntimeMethod: (
        request: RuntimeExtensionMethodRequest
    ) => Promise<RuntimeExtensionMethodResult>
): Promise<ImportPreviewResult> {
    return previewImportFileThroughRuntime(
        input,
        executeRuntimeMethod,
        readDelimitedImportPreview
    );
};


export const readDelimitedImportPreview = function(request: ImportPreviewRequest): ImportPreviewResult {
    if (!request.file) {
        return createImportPreviewResult({
            status: "empty",
            error: "No file selected."
        });
    }

    if (isRuntimeImportPreviewRequest(request) || request.command === "convert") {
        return createImportPreviewUnsupportedResult();
    }

    if (!fs.existsSync(request.file)) {
        return createImportPreviewNotFoundResult();
    }

    const text = fs.readFileSync(request.file, "utf8");
    const table = parseDelimitedTable(
        text,
        "text",
        createDelimitedImportPreviewOptions(request)
    );

    return createImportPreviewResultFromDelimitedTable(table);
};

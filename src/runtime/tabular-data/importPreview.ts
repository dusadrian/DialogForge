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
    createImportPreviewResultFromRuntimeValue,
    createImportPreviewNotFoundResult,
    createImportPreviewUnsupportedResult,
    type ImportPreviewResult
} from "./importPreviewResult";
import {
    createImportPreviewRequest,
    isRuntimeImportPreviewRequest,
    type ImportPreviewRequest
} from "./importPreviewRequest";
import {
    createRuntimeImportPreviewRequest
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


const shouldTryRuntimeImportPreview = function(request: ImportPreviewRequest): boolean {
    return Boolean(request.file);
};


const shouldUseDelimitedPreviewFallback = function(
    request: ImportPreviewRequest,
    result: RuntimeExtensionMethodResult
): boolean {
    if (isRuntimeImportPreviewRequest(request)) {
        return false;
    }
    if (request.binary || request.command === "convert") {
        return false;
    }

    return result.status === "unavailable" || result.status === "unsupported";
};


export const previewImportFileWithRuntime = async function(
    input: Partial<ImportPreviewRequest>,
    executeRuntimeMethod: (request: RuntimeExtensionMethodRequest) => Promise<RuntimeExtensionMethodResult>
): Promise<ImportPreviewResult> {
    const request = createImportPreviewRequest(input || {});

    if (shouldTryRuntimeImportPreview(request)) {
        const result = await executeRuntimeMethod(
            createRuntimeImportPreviewRequest(request)
        );

        if (result.status === "ready") {
            return createImportPreviewResultFromRuntimeValue(
                result.value,
                "Runtime returned an empty import preview."
            );
        }

        if (!shouldUseDelimitedPreviewFallback(request, result)) {
            return createImportPreviewResult({
                status: result.status,
                error: result.message || "Runtime import preview is not available."
            });
        }
    }

    return readDelimitedImportPreview(request);
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

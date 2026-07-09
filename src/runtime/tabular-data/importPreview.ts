import * as fs from "fs";

import {
    createRuntimeExtensionMethodRequest
} from "../extensions/runtimeExtensionProtocol";
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


export {
    createImportPreviewResult,
    createImportPreviewResultFromRuntimeValue,
    createImportPreviewNotFoundResult,
    createImportPreviewUnsupportedResult,
    type ImportPreviewResult
} from "./importPreviewResult";


export interface ImportPreviewRequest {
    command: string;
    file: string;
    nrows: number;
    binary: boolean;
    header: boolean;
    rowNames: number;
    sep: string;
    quote: string;
    dec: string;
    naStrings: string;
    skip: number;
    stripWhite: boolean;
    commentChar: string;
    fileEncoding: string;
    runtimeOnly: boolean;
}


export const createImportPreviewRequest = function(input: Partial<ImportPreviewRequest>): ImportPreviewRequest {
    return {
        command: String(input.command || ""),
        file: String(input.file || ""),
        nrows: Number.isFinite(Number(input.nrows)) ? Number(input.nrows) : 8,
        binary: input.binary === true,
        header: input.header !== false,
        rowNames: Math.max(0, Number(input.rowNames) || 0),
        sep: String(input.sep || ""),
        quote: String(input.quote ?? "\""),
        dec: String(input.dec || "."),
        naStrings: String(input.naStrings || (input as Record<string, unknown>)["na.strings"] || "NA"),
        skip: Math.max(0, Number(input.skip) || 0),
        stripWhite: input.stripWhite === true || (input as Record<string, unknown>)["strip.white"] === true,
        commentChar: String(input.commentChar ?? (input as Record<string, unknown>)["comment.char"] ?? "#"),
        fileEncoding: String(input.fileEncoding || ""),
        runtimeOnly: input.runtimeOnly === true
    };
};


export const isRuntimeImportPreviewRequest = function(request: ImportPreviewRequest): boolean {
    return request.runtimeOnly === true;
};


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
        const result = await executeRuntimeMethod(createRuntimeExtensionMethodRequest({
            method: "workspace.import_file_preview",
            params: {
                path: request.file,
                reader: request.command,
                nrows: request.nrows,
                binary: request.binary,
                header: request.header,
                rowNames: request.rowNames,
                sep: request.sep,
                quote: request.quote,
                dec: request.dec,
                naStrings: request.naStrings,
                skip: request.skip,
                stripWhite: request.stripWhite,
                commentChar: request.commentChar,
                fileEncoding: request.fileEncoding
            },
            source: "base-app.import-preview"
        }));

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

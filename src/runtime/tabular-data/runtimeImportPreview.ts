import {
    createRuntimeExtensionMethodRequest
} from "../extensions/runtimeExtensionProtocol";
import type {
    RuntimeExtensionMethodRequest,
    RuntimeExtensionMethodResult
} from "../provider-contract/runtimeProvider";
import {
    createImportPreviewResult,
    createImportPreviewResultFromRuntimeValue,
    type ImportPreviewResult
} from "./importPreviewResult";
import {
    createImportPreviewRequest,
    type ImportPreviewRequest
} from "./importPreviewRequest";


export const createRuntimeImportPreviewRequest = function(
    input: Partial<ImportPreviewRequest>
): RuntimeExtensionMethodRequest {
    const request = createImportPreviewRequest(input || {});

    return createRuntimeExtensionMethodRequest({
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
    });
};


export const previewImportFileThroughRuntime = async function(
    input: Partial<ImportPreviewRequest>,
    executeRuntimeMethod: (
        request: RuntimeExtensionMethodRequest
    ) => Promise<RuntimeExtensionMethodResult>
): Promise<ImportPreviewResult> {
    const request = createImportPreviewRequest(input || {});

    if (!request.file) {
        return createImportPreviewResult({
            status: "empty",
            error: "No file selected."
        });
    }

    const result = await executeRuntimeMethod(
        createRuntimeImportPreviewRequest(request)
    );

    if (result.status === "ready") {
        return createImportPreviewResultFromRuntimeValue(
            result.value,
            "Runtime returned an empty import preview."
        );
    }

    return createImportPreviewResult({
        status: result.status,
        error: result.message || "Runtime import preview is not available."
    });
};

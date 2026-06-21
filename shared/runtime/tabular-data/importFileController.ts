import * as fs from "fs";

import type {
    ImportPlanRequest,
    ImportPlanResult,
    RuntimeExtensionMethodRequest,
    RuntimeExtensionMethodResult
} from "../provider-contract/runtimeProvider";
import {
    inferImportFormat,
    isSupportedImportFormat
} from "./importFormat";
import {
    createImportPlanRequest,
    createImportPlanResult
} from "./importProtocol";
import {
    previewImportFileWithRuntime,
    type ImportPreviewRequest,
    type ImportPreviewResult
} from "./importPreview";


export interface ImportFileControllerBindings {
    executeRuntimeMethod(
        request: RuntimeExtensionMethodRequest
    ): Promise<RuntimeExtensionMethodResult>;
}


export interface ImportFileController {
    planFile(input: Partial<ImportPlanRequest>): ImportPlanResult;
    previewFile(
        input: Partial<ImportPreviewRequest>
    ): Promise<ImportPreviewResult>;
}


const failedPreview = function(error: unknown): ImportPreviewResult {
    return {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        colnames: [],
        vdata: []
    };
};


export const createImportFileController = function(
    bindings: ImportFileControllerBindings
): ImportFileController {
    const planFile = function(
        input: Partial<ImportPlanRequest>
    ): ImportPlanResult {
        const request = createImportPlanRequest(input || {});

        if (!request.source) {
            return createImportPlanResult({
                status: "empty",
                source: "",
                message: "No import source was selected."
            });
        }

        try {
            const stats = fs.statSync(request.source);
            const format = inferImportFormat(request.source);

            if (stats.isFile() && !isSupportedImportFormat(format)) {
                return createImportPlanResult({
                    status: "unsupported-format",
                    source: request.source,
                    targetName: request.targetName,
                    exists: true,
                    sizeBytes: stats.size,
                    message: "Import format is not implemented yet."
                });
            }

            return createImportPlanResult({
                status: stats.isFile() ? "ready" : "not-file",
                source: request.source,
                targetName: request.targetName,
                exists: true,
                sizeBytes: stats.size,
                message: stats.isFile()
                    ? "Import source is available."
                    : "Import source is not a file."
            });
        } catch {
            return createImportPlanResult({
                status: "not-found",
                source: request.source,
                targetName: request.targetName,
                exists: false,
                message: "Import source does not exist."
            });
        }
    };

    const previewFile = async function(
        input: Partial<ImportPreviewRequest>
    ): Promise<ImportPreviewResult> {
        try {
            return await previewImportFileWithRuntime(
                input || {},
                bindings.executeRuntimeMethod
            );
        } catch (error) {
            return failedPreview(error);
        }
    };

    return {
        planFile,
        previewFile
    };
};

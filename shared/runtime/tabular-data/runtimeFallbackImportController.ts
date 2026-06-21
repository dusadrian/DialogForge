import * as fs from "fs";

import { createTranscriptEvent } from "../commands/commandProtocol";
import type {
    ImportRequest,
    ImportResult
} from "../provider-contract/runtimeProvider";
import type {
    RuntimeFallbackTabularState
} from "../session/runtimeFallbackTabularState";
import { parseDelimitedTable } from "./delimitedImport";
import { createImportResult } from "./importProtocol";


export interface RuntimeFallbackImportControllerOptions {
    state: RuntimeFallbackTabularState;
    hasWorkspaceObject(objectName: string): boolean;
}


export interface RuntimeFallbackImportController {
    importData(
        providerId: string,
        request: ImportRequest,
        targetName: string
    ): ImportResult;
}


const delimitedFormats = new Set([
    "csv",
    "tsv",
    "text"
]);


export const createRuntimeFallbackImportController = function(
    options: RuntimeFallbackImportControllerOptions
): RuntimeFallbackImportController {
    return {
        importData: function(providerId, request, targetName) {
            if (!delimitedFormats.has(request.format)) {
                return createImportResult({
                    status: "unsupported-format",
                    providerId,
                    source: request.source,
                    format: request.format,
                    targetName: request.targetName,
                    overwrite: request.overwrite,
                    message: "Import format is not implemented yet."
                });
            }

            if (
                options.hasWorkspaceObject(targetName) &&
                !request.overwrite
            ) {
                return createImportResult({
                    status: "conflict",
                    providerId,
                    source: request.source,
                    format: request.format,
                    targetName,
                    overwrite: request.overwrite,
                    message: "Import target already exists. Enable overwrite to replace it."
                });
            }

            const canReadDelimitedFile =
                delimitedFormats.has(request.format) &&
                fs.existsSync(request.source);
            const rows = canReadDelimitedFile
                ? parseDelimitedTable(
                    fs.readFileSync(request.source, "utf8"),
                    request.format
                ).rows
                : [
                    { case: "Imported 1", value: 1 },
                    { case: "Imported 2", value: 0 }
                ];

            options.state.register(targetName, rows, {
                source: request.source,
                format: request.format
            });

            const transcriptRequest = {
                kind: "data.import",
                source: "base-app.import",
                text: request.source
            };

            return createImportResult({
                status: canReadDelimitedFile ? "imported" : "planned",
                providerId,
                source: request.source,
                format: request.format,
                targetName,
                overwrite: request.overwrite,
                transcriptEvents: [
                    createTranscriptEvent("submitted", transcriptRequest),
                    createTranscriptEvent(
                        "output",
                        transcriptRequest,
                        {
                            message: "Placeholder import registered " +
                                targetName + "."
                        }
                    ),
                    createTranscriptEvent("completed", transcriptRequest)
                ],
                message: canReadDelimitedFile
                    ? "Delimited file was imported into the provider-neutral session table."
                    : "Import request registered a placeholder table. No file was read."
            });
        }
    };
};

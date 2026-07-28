import { createTranscriptEvent } from "../../../commands/commandProtocol";
import { createImportResult } from "../../../tabular-data/importProtocol";
import type {
    ImportRequest,
    RuntimeCommandExecutionResult,
    RuntimeImportController,
    RuntimeSessionSnapshot,
    TranscriptEvent
} from "../../../provider-contract/runtimeProvider";
import {
    createVisibleImportCommand,
    supportsRImportFormat
} from "../import/rImportCommand";
import type {
    RRuntimeControlClient
} from "../protocol/runtimeControlClient";


export interface RImportControllerOptions {
    getClient(): RRuntimeControlClient | null;
    createRequestId(prefix: string): string;
    executeVisibleCommand(
        commandText: string,
        source: string,
        snapshot: RuntimeSessionSnapshot
    ): Promise<RuntimeCommandExecutionResult>;
    transcriptHasFailure(events: TranscriptEvent[]): boolean;
}


export const createRImportController = function(
    options: RImportControllerOptions
): RuntimeImportController {
    return {
        supportsFormat: supportsRImportFormat,
        importData: async function(
            request: ImportRequest,
            snapshot: RuntimeSessionSnapshot
        ) {
            const client = options.getClient();

            if (!client) {
                return createImportResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    source: request.source,
                    format: request.format,
                    targetName: request.targetName,
                    overwrite: request.overwrite,
                    message: "R runtime-control session is not attached."
                });
            }

            const targetName = request.targetName || "imported_data";

            if (request.uiCommandVisibility === "visible") {
                const commandText = (
                    String(request.visibleCommandText || "").trim()
                    || createVisibleImportCommand(request, targetName)
                );
                const commandResult = await options.executeVisibleCommand(
                    commandText,
                    "ui.data.import",
                    snapshot
                );
                const transcriptEvents = commandResult.transcriptEvents;
                const failed = options.transcriptHasFailure(transcriptEvents);

                return createImportResult({
                    status: failed ? "failed" : "imported",
                    providerId: snapshot.providerId,
                    source: request.source,
                    format: request.format,
                    targetName,
                    overwrite: request.overwrite,
                    transcriptEvents,
                    workspaceUpdate: commandResult.workspaceUpdate,
                    message: failed
                        ? "R visible import command failed."
                        : "R visible import command imported the file."
                });
            }

            const code = createVisibleImportCommand(request, targetName);
            const result = await client.execute({
                id: options.createRequestId("import-data"),
                method: "evaluate_code",
                params: {
                    code,
                    mode: "silent",
                    timeoutMs: 30000
                }
            });
            const transcriptRequest = {
                kind: "data.import",
                source: "runtime.import",
                text: request.source
            };
            const targetExists = String(result.error || "").includes(
                "import-target-exists"
            );
            const imported = result.ok;

            return createImportResult({
                status: imported
                    ? "imported"
                    : (targetExists ? "conflict" : "failed"),
                providerId: snapshot.providerId,
                source: request.source,
                format: request.format,
                targetName,
                overwrite: request.overwrite,
                transcriptEvents: [
                    createTranscriptEvent("submitted", transcriptRequest),
                    createTranscriptEvent(
                        imported ? "completed" : "failed",
                        transcriptRequest,
                        {
                            message: imported
                                ? `Imported ${targetName}.`
                                : String(
                                    result.error
                                    || "R import failed."
                                )
                        }
                    )
                ],
                message: imported
                    ? "R runtime-control imported the file."
                    : String(
                        result.error
                        || "R import failed."
                    )
            });
        }
    };
};

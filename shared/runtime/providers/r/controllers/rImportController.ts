import { createTranscriptEvent } from "../../../commands/commandProtocol";
import { createImportResult } from "../../../tabular-data/importProtocol";
import type {
    ImportRequest,
    RuntimeImportController,
    RuntimeSessionSnapshot,
    TranscriptEvent
} from "../../../provider-contract/runtimeProvider";
import {
    createVisibleImportCommand,
    supportsRImportFormat
} from "../import/rImportCommand";
import { createRuntimeControlClient } from "../protocol/runtimeControlClient";


type RuntimeControlClient = ReturnType<typeof createRuntimeControlClient>;


export interface RImportControllerOptions {
    getClient(): RuntimeControlClient | null;
    createRequestId(prefix: string): string;
    executeVisibleCommand(
        commandText: string,
        source: string,
        snapshot: RuntimeSessionSnapshot
    ): Promise<TranscriptEvent[]>;
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
                const transcriptEvents = await options.executeVisibleCommand(
                    commandText,
                    "ui.data.import",
                    snapshot
                );
                const failed = options.transcriptHasFailure(transcriptEvents);

                return createImportResult({
                    status: failed ? "failed" : "imported",
                    providerId: snapshot.providerId,
                    source: request.source,
                    format: request.format,
                    targetName,
                    overwrite: request.overwrite,
                    transcriptEvents,
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
                source: "runtime-r.import",
                text: request.source
            };
            const targetExists = String(result.error || "").includes(
                "import-target-exists"
            );

            return createImportResult({
                status: result.ok
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
                        result.ok ? "completed" : "failed",
                        transcriptRequest,
                        {
                            message: result.ok
                                ? `Imported ${targetName}.`
                                : String(result.error || "R import failed.")
                        }
                    )
                ],
                message: result.ok
                    ? "R runtime-control imported the file."
                    : String(result.error || "R import failed.")
            });
        }
    };
};

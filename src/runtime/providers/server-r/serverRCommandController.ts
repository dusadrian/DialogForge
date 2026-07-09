import { createTranscriptEvent } from "../../commands/commandProtocol";
import type {
    RuntimeCommandController,
    RuntimeSessionSnapshot,
    TranscriptEvent,
    VisibleCommandRequest
} from "../../provider-contract/runtimeProvider";
import type { RuntimeTransportController } from "../../transport/runtimeTransport";
import { serverRTransportMethods } from "./serverRTransportMethods";
import {
    readResponseObject,
    sendServerRRequest
} from "./serverRTransportResponse";


export const createServerRCommandController = function(
    transport: RuntimeTransportController
): RuntimeCommandController {
    return {
        executeVisibleCommand: async function(
            request: VisibleCommandRequest,
            _snapshot: RuntimeSessionSnapshot
        ): Promise<TranscriptEvent[]> {
            const response = await sendServerRRequest(
                transport,
                serverRTransportMethods.visibleCommand,
                { request }
            );

            if (!response.status || response.status === "error") {
                return [
                    createTranscriptEvent("submitted", request),
                    createTranscriptEvent("rejected", request, {
                        message: response.message || "Server R command was rejected."
                    })
                ];
            }

            const payload = readResponseObject(response);
            const events = Array.isArray(payload.transcriptEvents)
                ? payload.transcriptEvents as TranscriptEvent[]
                : [];

            if (events.length > 0) {
                return events;
            }

            return [
                createTranscriptEvent("submitted", request),
                createTranscriptEvent("completed", request, {
                    message: response.message || "Server R command completed."
                })
            ];
        }
    };
};

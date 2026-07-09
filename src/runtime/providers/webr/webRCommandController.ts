import { createTranscriptEvent } from "../../commands/commandProtocol";
import type {
    RuntimeCommandController,
    RuntimeSessionSnapshot,
    TranscriptEvent,
    VisibleCommandRequest
} from "../../provider-contract/runtimeProvider";
import type { RuntimeTransportController } from "../../transport/runtimeTransport";
import { webRTransportMethods } from "./webRTransportMethods";
import {
    readResponseObject,
    sendWebRRequest
} from "./webRTransportResponse";


export const createWebRCommandController = function(
    transport: RuntimeTransportController
): RuntimeCommandController {
    return {
        executeVisibleCommand: async function(
            request: VisibleCommandRequest,
            _snapshot: RuntimeSessionSnapshot
        ): Promise<TranscriptEvent[]> {
            const response = await sendWebRRequest(
                transport,
                webRTransportMethods.visibleCommand,
                { request }
            );

            if (!response.status || response.status === "error") {
                return [
                    createTranscriptEvent("submitted", request),
                    createTranscriptEvent("rejected", request, {
                        message: response.message || "WebR command was rejected."
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
                    message: response.message || "WebR command completed."
                })
            ];
        }
    };
};

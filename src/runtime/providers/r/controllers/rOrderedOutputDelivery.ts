import type { TranscriptEvent, VisibleCommandRequest } from "../../../provider-contract/runtimeProvider";
import type { RuntimeOutputJournalTransport } from "../../../output/runtimeOutputJournalReader";
import { createRuntimeOutputTranscriptReader } from "../../../output/runtimeOutputTranscriptReader";
import type { RRuntimeControlResponse } from "../protocol/runtimeControlClient";
import { createRuntimeOutputDeliveryDiagnostics } from "../protocol/runtimeControlDiagnostics";
import {
    asRuntimeControlObject,
    readRuntimeCommandCompletionMarker
} from "../protocol/runtimeControlEvents";


// One R response/receipt policy for native and WebR output transports.
export const createROrderedOutputDelivery = function(options: {
    transport: RuntimeOutputJournalTransport;
    sessionId: string;
    parentId: string;
    request: VisibleCommandRequest;
    isCurrent: () => boolean;
    onTranscriptEvents?: (events: TranscriptEvent[]) => void;
}) {
    const { sessionId, parentId, isCurrent, onTranscriptEvents } = options;
    const diagnostics = createRuntimeOutputDeliveryDiagnostics(sessionId, parentId);
    const returnedEvents: TranscriptEvent[] = [];
    let hasValidCompletion = false;
    const pipeline = createRuntimeOutputTranscriptReader({
        ...options,
        encoding: "utf8",
        acceptCompletion: () => hasValidCompletion,
        publish: (event) => {
            if (onTranscriptEvents) {
                onTranscriptEvents([event]);
            } else {
                returnedEvents.push(event);
            }
            return true;
        }
    });
    const returnedOutputEvents = function() {
        return returnedEvents.map((event) => ({
            type: "stream", id: event.id, parent_id: parentId,
            name: event.streamName, text: event.message
        }));
    };
    const finishCapturedResponse = async function(response: RRuntimeControlResponse): Promise<RRuntimeControlResponse> {
        let current;
        try {
            current = isCurrent();
        } catch {
            await pipeline.retire();
            return {
                ...response, ok: false, error: "runtime-output-owner-check-failed",
                events: [
                    ...returnedOutputEvents(),
                    ...(Array.isArray(response.events) ? response.events : [])
                ]
            };
        }
        if (!current) {
            await pipeline.retire();
            return response;
        }
        if (response.transportFailure || !response.ok) {
            await pipeline.retire();
            return { ...response, events: [
                ...returnedOutputEvents(), ...(Array.isArray(response.events) ? response.events : [])
            ] };
        }
        const receipt = asRuntimeControlObject(response.result);
        const events = Array.isArray(response.events) ? response.events : [];
        const completionMarker = readRuntimeCommandCompletionMarker(events, parentId);
        const hasMatchingCompletion = completionMarker.status !== "missing";
        hasValidCompletion = completionMarker.status === "valid";
        const result = await pipeline.finishProducer({
            sessionId: String(receipt.sessionId || ""),
            parentId: String(receipt.parentId || ""),
            captureStatus: receipt.captureStatus === "sealed" ? "sealed" : "failed",
            outputSequence: typeof receipt.outputSequence === "number" ? receipt.outputSequence : null
        });
        const chunks = returnedOutputEvents();
        if (result.completionAccepted && hasValidCompletion) {
            return { ...response, events: [...chunks, ...events] };
        }
        const terminalEvents = events.map((event) => {
            const value = asRuntimeControlObject(event);
            return value.type === "completion" && value.parent_id === parentId
                ? { ...value, state: "error" } : event;
        });
        let deliveryFailure = "Ordered output capture did not complete.";
        if (!hasMatchingCompletion) {
            deliveryFailure = "Ordered output response has no matching completion.";
        }
        else if (!hasValidCompletion) {
            deliveryFailure = "Ordered output response has an invalid completion marker.";
        }
        const failure = {
            type: "stream", id: `runtime-output-failure:${JSON.stringify([sessionId, parentId])}`,
            parent_id: parentId, name: "stderr",
            text: result.transcript.detail || result.capture.detail || deliveryFailure
        };
        if (!hasMatchingCompletion) {
            // Report delivery failure without inventing an R completion or
            // rewriting its evaluation/workspace receipts.
            terminalEvents.push({
                type: "state", id: `runtime-output-failure-state:${JSON.stringify([sessionId, parentId])}`,
                parent_id: parentId, state: "error"
            });
        }
        return { ...response, events: [...chunks, failure, ...terminalEvents] };
    };
    const finish = async function(response: RRuntimeControlResponse): Promise<RRuntimeControlResponse> {
        diagnostics.record("started");
        try {
            const delivered = await finishCapturedResponse(response);
            const state = pipeline.snapshot();
            diagnostics.record(!delivered.ok ? "failed" : state.completionAccepted ? "accepted"
                : state.capture.status === "retired" ? "retired" : "failed");
            return delivered;
        } catch (error) {
            diagnostics.record("failed");
            throw error;
        } finally {
            diagnostics.record("finished");
        }
    };
    return { ...pipeline, finish };
};

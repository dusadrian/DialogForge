import { randomUUID } from "node:crypto";
import * as path from "node:path";
import type { TranscriptEvent, VisibleCommandRequest } from "../../../provider-contract/runtimeProvider";
import type { RRuntimeControlResponse } from "../protocol/runtimeControlClient";
import { createROrderedOutputDelivery } from "../controllers/rOrderedOutputDelivery";
import { createNativeOutputJournalTransport } from "./runtimeOutputJournalReaderPrototype";


export const prepareNativeOrderedOutput = function(options: {
    directory: string;
    sessionId: string;
    parentId: string;
    request: VisibleCommandRequest;
    isCurrent: () => boolean;
    onTranscriptEvents?: (events: TranscriptEvent[]) => void;
}) {
    const { directory, sessionId, parentId, request, isCurrent, onTranscriptEvents } = options;
    const name = `${randomUUID()}.bin`;
    const pipeline = createROrderedOutputDelivery({
        transport: createNativeOutputJournalTransport(path.join(directory, name)),
        sessionId, parentId, request, isCurrent, onTranscriptEvents
    });
    let running = false;
    let timer: NodeJS.Timeout | null = null;
    const stopPolling = function(): void {
        running = false;
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };
    const poll = async function(): Promise<void> {
        const result = await pipeline.poll();
        if (
            running
            && result.capture.status !== "failed" && result.capture.status !== "retired"
            && result.capture.status !== "producer_sealed" && result.capture.status !== "accepted"
        ) {
            timer = setTimeout(() => { void poll(); }, 10);
            timer.unref();
        }
    };
    const finish = async function(response: RRuntimeControlResponse): Promise<RRuntimeControlResponse> {
        stopPolling();
        return pipeline.finish(response);
    };
    const retire = async function(): Promise<void> {
        stopPolling();
        await pipeline.retire();
    };
    return {
        params: { outputCaptureName: name, outputCaptureSession: sessionId },
        onDispatched: function(): void {
            running = true;
            void poll();
        },
        finish,
        retire
    };
};

import { createRuntimeOutputJournalReader, type RuntimeOutputJournalTransport } from "./runtimeOutputJournalReader";
import { createRuntimeOutputTranscriptBridge, type RuntimeOutputTranscriptBridgeOptions } from "./runtimeOutputTranscriptBridge";


// Shared completion barrier: accepting bytes alone never acknowledges text.
export const createRuntimeOutputTranscriptReader = function(
    options: RuntimeOutputTranscriptBridgeOptions & {
        transport: RuntimeOutputJournalTransport;
        acceptCompletion?(): boolean;
    }
) {
    let completionAccepted = false;
    let deliveryFinished = false;
    const bridge = createRuntimeOutputTranscriptBridge(options);
    const reader = createRuntimeOutputJournalReader({
        transport: options.transport,
        sessionId: options.sessionId,
        parentId: options.parentId,
        isCurrent: options.isCurrent,
        publish: bridge.append,
        acceptSeal: function(outputSequence): boolean {
            const textAccepted = bridge.finish(outputSequence);
            completionAccepted = textAccepted
                && (!options.acceptCompletion || options.acceptCompletion() === true);
            return completionAccepted;
        }
    });
    const snapshot = function() {
        const capture = reader.snapshot();
        const transcript = bridge.snapshot();
        return {
            capture,
            transcript,
            completionAccepted: deliveryFinished && completionAccepted
                && capture.status === "accepted" && transcript.status === "finished"
        };
    };
    const poll = async function() {
        await reader.poll();
        return snapshot();
    };
    const finishProducer = async function(
        receipt: Parameters<typeof reader.finishProducer>[0]
    ) {
        await reader.finishProducer(receipt);
        deliveryFinished = true;
        return snapshot();
    };
    const retire = async function(): Promise<void> {
        bridge.retire();
        await reader.retire();
    };
    return { poll, finishProducer, retire, snapshot };
};

import {
    createRuntimeOutputTranscriptBridge as createNativeOutputTranscriptBridge,
    type RuntimeOutputTranscriptBridgeOptions as NativeOutputTranscriptBridgeOptions
} from "../../../output/runtimeOutputTranscriptBridge";
import { createNativeOutputJournalTransport } from "./runtimeOutputJournalReaderPrototype";
import { createRuntimeOutputTranscriptReader } from "../../../output/runtimeOutputTranscriptReader";


// Keep the adapter-facing names, but export the very same shared function.
export { createNativeOutputTranscriptBridge };
export type { NativeOutputTranscriptBridgeOptions };


// Composition ensures raw producer acceptance alone cannot acknowledge text.
export const createNativeOutputTranscriptReader = function(
    options: NativeOutputTranscriptBridgeOptions & { path: string }
) {
    return createRuntimeOutputTranscriptReader({
        ...options,
        transport: createNativeOutputJournalTransport(options.path)
    });
};

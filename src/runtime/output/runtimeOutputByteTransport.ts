import type { RuntimeOutputJournalTransport } from "./runtimeOutputJournalReader";
import { runtimeOutputJournalFormat } from "./runtimeOutputJournalFormat";


// Byte storage for pushed transports; no frame, transcript or receipt semantics.
export const createRuntimeOutputByteTransport = function(identity: string) {
    if (!identity) {
        throw new Error("Runtime output byte transport requires a source identity.");
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    let readOffset = 0;
    let chunkOffset = 0;
    let closed = false;
    let failure = "";

    const append = function(offset: unknown, bytes: unknown): void {
        if (closed || failure) {
            throw new Error(failure || "Runtime output byte transport is closed.");
        }
        if (
            offset !== size || !(bytes instanceof Uint8Array) || !bytes.length
            || bytes.length > runtimeOutputJournalFormat.maximumPayloadBytes + runtimeOutputJournalFormat.frameHeaderBytes
            || size + bytes.length > runtimeOutputJournalFormat.maximumJournalBytes
        ) {
            failure = "Runtime output byte transport received invalid or out-of-order bytes.";
            throw new Error(failure);
        }
        chunks.push(bytes.slice());
        size += bytes.length;
    };

    const transport: RuntimeOutputJournalTransport = {
        inspect: async function() {
            if (failure) {
                throw new Error(failure);
            }
            return closed || !size ? null : { identity, size };
        },
        read: async function(offset, length) {
            if (
                closed || failure || offset !== readOffset
                || !Number.isSafeInteger(length) || length < 1
            ) {
                throw new Error(failure || "Runtime output byte transport is not readable at this offset.");
            }
            const result = new Uint8Array(Math.min(length, size - readOffset));
            let written = 0;
            while (written < result.length) {
                const first = chunks[0];
                const count = Math.min(first.length - chunkOffset, result.length - written);
                result.set(first.subarray(chunkOffset, chunkOffset + count), written);
                chunkOffset += count;
                written += count;
                if (chunkOffset === first.length) {
                    chunks.shift();
                    chunkOffset = 0;
                }
            }
            readOffset += written;
            return result;
        },
        close: async function() {
            closed = true;
            chunks.length = 0;
        }
    };
    return { append, transport };
};

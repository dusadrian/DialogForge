import { decodeRuntimeControlFrameBytes, checkRuntimeControlFrameByteLength,
    maximumRuntimeControlFrameBytes } from "./runtimeControlResponseValidation";


// Bound retained bytes before decoding, including an unterminated frame.
export const createRuntimeControlFrameReader = function(
    deliver: (line: string) => void,
    maxFrameBytes = maximumRuntimeControlFrameBytes
) {
    if (!Number.isSafeInteger(maxFrameBytes) || maxFrameBytes < 512) {
        throw new Error("Runtime frame limit must be an integer of at least 512 bytes.");
    }
    let buffer: Buffer = Buffer.alloc(0);
    let retained = 0;
    let failed = false;

    const push = function(chunk: Buffer): void {
        if (failed) {
            throw new Error("Runtime frame reader has failed.");
        }
        try {
            let start = 0;
            while (start < chunk.length) {
                const newline = chunk.indexOf(10, start);
                const end = newline < 0 ? chunk.length : newline;
                const length = end - start;
                checkRuntimeControlFrameByteLength(retained + length, maxFrameBytes);
                if (length) {
                    if (buffer.length < retained + length) {
                        const capacity = Math.min(maxFrameBytes,
                            Math.max(retained + length, buffer.length * 2, 512));
                        const grown = Buffer.alloc(capacity);
                        buffer.copy(grown, 0, 0, retained);
                        buffer = grown;
                    }
                    chunk.copy(buffer, retained, start, end);
                    retained += length;
                }
                if (newline < 0) {
                    return;
                }
                const bytes = buffer.subarray(0, retained);
                retained = 0;
                const line = decodeRuntimeControlFrameBytes(bytes, maxFrameBytes).replace(/\r$/, "");
                if (line.trim()) {
                    deliver(line);
                }
                start = newline + 1;
            }
        } catch (error) {
            failed = true;
            buffer = Buffer.alloc(0);
            retained = 0;
            throw error;
        }
    };
    const end = function(): void {
        if (retained) {
            failed = true;
            buffer = Buffer.alloc(0);
            retained = 0;
            throw new Error("runtime-session-truncated-frame");
        }
    };
    return { push, end };
};

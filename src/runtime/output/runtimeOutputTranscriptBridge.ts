import { createTranscriptEvent } from "../commands/commandProtocol";
import type { TranscriptEvent, VisibleCommandRequest } from "../provider-contract/runtimeProvider";
import { runtimeOutputJournalFormat } from "./runtimeOutputJournalFormat";


export interface RuntimeOutputChunk {
    readonly sessionId: string;
    readonly parentId: string;
    readonly sequence: number;
    readonly channel: "stdout" | "stderr";
    readonly bytes: Uint8Array;
}


export interface RuntimeOutputTranscriptBridgeOptions {
    sessionId: string;
    parentId: string;
    encoding: "utf8";
    request: VisibleCommandRequest;
    isCurrent: () => boolean;
    publish: (event: TranscriptEvent) => boolean;
}


// One shared consumer for native and browser transport adapters.
// Transports supply owned byte chunks and a validated producer seal.
export const createRuntimeOutputTranscriptBridge = function(
    options: RuntimeOutputTranscriptBridgeOptions
) {
    if (!options.sessionId || !options.parentId || options.encoding !== "utf8") {
        throw new Error("Runtime output bridge requires owner identities and confirmed UTF-8 encoding.");
    }
    const { sessionId, parentId, isCurrent, publish } = options;
    const request = { ...options.request };
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    let status: "open" | "publishing" | "finished" | "failed" | "retired" = "open";
    let detail = "";
    let lastSequence = 0;
    let pending: Uint8Array = new Uint8Array(0);
    let pendingChannel: RuntimeOutputChunk["channel"] | null = null;

    const snapshot = function() {
        return { status, detail, lastSequence, pendingBytes: pending.length };
    };

    const fail = function(message: string): false {
        if (status !== "retired" && status !== "failed") {
            status = "failed";
            detail = message;
        }
        pending = new Uint8Array(0);
        pendingChannel = null;
        return false;
    };

    const ownsPublication = function(): boolean {
        if (status !== "open") {
            return false;
        }
        if (!isCurrent()) {
            status = "retired";
            pending = new Uint8Array(0);
            pendingChannel = null;
            return false;
        }
        return true;
    };

    const incompleteSuffixLength = function(bytes: Uint8Array): number {
        if (!bytes.length) {
            return 0;
        }
        let start = bytes.length - 1;
        while (start > 0 && (bytes[start] & 0xc0) === 0x80 && bytes.length - start < 4) {
            start--;
        }
        const lead = bytes[start];
        const width = lead >= 0xc2 && lead <= 0xdf ? 2
            : lead >= 0xe0 && lead <= 0xef ? 3
            : lead >= 0xf0 && lead <= 0xf4 ? 4 : 1;
        const remaining = bytes.length - start;
        return width > remaining ? remaining : 0;
    };

    const append = function(chunk: RuntimeOutputChunk): boolean {
        try {
            if (status === "publishing") {
                return fail("Reentrant runtime transcript publication is not supported.");
            }
            if (!ownsPublication()) {
                return false;
            }
            if (
                chunk.sessionId !== sessionId || chunk.parentId !== parentId
                || !Number.isSafeInteger(chunk.sequence) || chunk.sequence !== lastSequence + 1
                || (chunk.channel !== "stdout" && chunk.channel !== "stderr")
                || !(chunk.bytes instanceof Uint8Array)
                || chunk.bytes.length > runtimeOutputJournalFormat.maximumPayloadBytes
            ) {
                return fail("Runtime transcript chunk has invalid ownership, sequence or payload.");
            }
            if (pending.length && pendingChannel !== chunk.channel) {
                return fail("An incomplete UTF-8 character crosses output channels.");
            }
            lastSequence = chunk.sequence;
            const bytes = new Uint8Array(pending.length + chunk.bytes.length);
            bytes.set(pending);
            bytes.set(chunk.bytes, pending.length);
            const suffix = incompleteSuffixLength(bytes);
            const completeLength = bytes.length - suffix;
            const text = decoder.decode(bytes.subarray(0, completeLength));
            pending = bytes.slice(completeLength);
            pendingChannel = pending.length ? chunk.channel : null;
            if (!text.length) {
                return true;
            }
            const event = createTranscriptEvent("output", request, {
                id: `runtime-output:${JSON.stringify([sessionId, parentId, chunk.sequence])}`,
                parentId,
                streamName: chunk.channel,
                message: text
            });
            status = "publishing";
            const accepted = publish(event);
            if (status !== "publishing") {
                return false;
            }
            status = "open";
            if (accepted !== true) {
                return fail("Runtime transcript publication was not accepted.");
            }
            return ownsPublication();
        } catch (error) {
            return fail(error instanceof Error ? error.message : "Runtime transcript decoding failed.");
        }
    };

    // Call only AFTER the reader accepts the matching sealed producer receipt.
    const finish = function(outputSequence: number): boolean {
        try {
            if (!ownsPublication()) {
                return false;
            }
            if (pending.length || outputSequence !== lastSequence + 1) {
                return fail("Runtime transcript ends with incomplete text or a mismatched seal.");
            }
            status = "finished";
            return true;
        } catch {
            return fail("Runtime transcript owner check failed.");
        }
    };

    const retire = function(): void {
        status = "retired";
        pending = new Uint8Array(0);
        pendingChannel = null;
    };

    return { append, finish, retire, snapshot };
};

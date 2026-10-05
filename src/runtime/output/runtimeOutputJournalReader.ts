import type { RuntimeOutputChunk } from "./runtimeOutputTranscriptBridge";
import { runtimeOutputJournalFormat } from "./runtimeOutputJournalFormat";


export interface RuntimeOutputJournalTransport {
    inspect(): Promise<{ identity: string; size: number } | null>;
    read(offset: number, length: number): Promise<Uint8Array>;
    close(): Promise<void>;
    // Optional host storage disposal, only after a matching sealed receipt.
    releaseAcceptedSource?(identity: string): Promise<void>;
}


export interface RuntimeOutputJournalSnapshot {
    status: "waiting" | "reading" | "producer_sealed" | "accepted" | "failed" | "retired";
    lastSequence: number;
    hasUnreadBytes: boolean;
    detail: string;
}


export interface RuntimeOutputProducerReceipt {
    sessionId: string;
    parentId: string;
    captureStatus: "sealed" | "failed";
    outputSequence: number | null;
}


export interface RuntimeOutputJournalReaderOptions {
    transport: RuntimeOutputJournalTransport;
    sessionId: string;
    parentId: string;
    isCurrent: () => boolean;
    // Synchronous acceptance only, not a socket/renderer/paint acknowledgment.
    publish: (chunk: RuntimeOutputChunk) => boolean;
    // Final consumer acceptance after a matching raw seal. A rejected text
    // suffix must not authorize disposal of otherwise valid capture bytes.
    acceptSeal?(outputSequence: number): boolean;
}


// Shared reader; host adapters supply file or worker-channel byte access.
export const createRuntimeOutputJournalReader = function(
    options: RuntimeOutputJournalReaderOptions
) {
    if (!options.transport || !options.sessionId || !options.parentId) {
        throw new Error("Runtime output reader requires a transport and owner identities.");
    }

    const { transport, sessionId, parentId, isCurrent, publish } = options;
    const frameLimit = runtimeOutputJournalFormat.maximumPayloadBytes;
    const journalLimit = runtimeOutputJournalFormat.maximumJournalBytes;
    const frameHeaderBytes = runtimeOutputJournalFormat.frameHeaderBytes;
    const header = new TextEncoder().encode(runtimeOutputJournalFormat.header);
    let status: RuntimeOutputJournalSnapshot["status"] = "waiting";
    let detail = "";
    let sourceIdentity: string | null = null;
    let offset = 0;
    let fileSize = 0;
    let pending: Uint8Array = new Uint8Array(0);
    let headerAccepted = false;
    let lastSequence = 0;
    let inFlight: Promise<RuntimeOutputJournalSnapshot> | null = null;
    let closing: Promise<void> | null = null;
    let releasing: Promise<void> | null = null;
    let finishing: Promise<RuntimeOutputJournalSnapshot> | null = null;
    let producerReceipt: RuntimeOutputProducerReceipt | null = null;

    const snapshot = function(): RuntimeOutputJournalSnapshot {
        return { status, lastSequence, hasUnreadBytes: offset < fileSize, detail };
    };

    const closeTransport = async function(): Promise<void> {
        try {
            if (!closing) {
                // Remember the attempt even when a host callback throws before
                // returning its promise. Later retirement must not retry it.
                closing = Promise.resolve().then(() => transport.close());
            }
            await closing;
        } catch {
            fail("Runtime output journal could not be closed.");
        }
    };

    const releaseAcceptedSource = async function(): Promise<void> {
        if (status !== "accepted" || sourceIdentity === null) {
            return;
        }
        try {
            if (!isCurrent()) {
                status = "retired";
                return;
            }
        } catch {
            fail("Runtime output owner check failed.");
            return;
        }
        // Closing may have waited while the owning session was replaced.
        // The ownership gate is shared even when a host has no release hook.
        if (!transport.releaseAcceptedSource) {
            return;
        }
        try {
            if (!releasing) {
                releasing = transport.releaseAcceptedSource(sourceIdentity);
            }
            await releasing;
        } catch {
            fail("Runtime output journal storage could not be released.");
        }
    };

    const fail = function(message: string): void {
        if (status !== "retired" && status !== "failed") {
            status = "failed";
            detail = message;
        }
        pending = new Uint8Array(0);
    };

    const ownsPublication = function(): boolean {
        if (status === "failed" || status === "retired" || status === "accepted") {
            return false;
        }
        let current;
        try {
            current = isCurrent();
        } catch {
            fail("Runtime output owner check failed.");
            return false;
        }
        if (!current) {
            status = "retired";
            pending = new Uint8Array(0);
            return false;
        }
        return true;
    };

    const consumeBytes = function(bytes: Uint8Array): void {
        const combined = new Uint8Array(pending.length + bytes.length);
        combined.set(pending);
        combined.set(bytes, pending.length);
        pending = combined;
        if (!headerAccepted) {
            if (pending.length < header.length) {
                return;
            }
            if (!header.every((byte, index) => pending[index] === byte)) {
                throw new Error("Unsupported runtime output journal header.");
            }
            pending = pending.subarray(header.length);
            headerAccepted = true;
        }

        while (pending.length) {
            if (status === "producer_sealed") {
                throw new Error("Runtime output journal has bytes after its seal.");
            }
            if (pending.length < frameHeaderBytes) {
                return;
            }
            const channel = pending[0];
            const view = new DataView(pending.buffer, pending.byteOffset, pending.byteLength);
            const sequence = view.getBigUint64(1);
            const length = view.getUint32(9);
            if (
                (channel !== 0 && channel !== 1 && channel !== 2)
                || sequence !== BigInt(lastSequence + 1)
                || sequence > BigInt(Number.MAX_SAFE_INTEGER)
                || length > frameLimit
                || (channel === 0 && length !== 0)
            ) {
                throw new Error("Invalid runtime output journal frame.");
            }
            if (pending.length < frameHeaderBytes + length) {
                return;
            }
            if (!ownsPublication()) {
                return;
            }
            const payload = pending.slice(frameHeaderBytes, frameHeaderBytes + length);
            pending = pending.subarray(frameHeaderBytes + length);
            lastSequence = Number(sequence);
            if (channel === 0) {
                status = "producer_sealed";
                continue;
            }
            if (publish({
                sessionId, parentId, sequence: lastSequence,
                channel: channel === 1 ? "stdout" : "stderr", bytes: payload
            }) !== true) {
                throw new Error("Runtime output publication was not accepted.");
            }
            if (!ownsPublication()) {
                return;
            }
        }
    };

    const readAvailable = async function(): Promise<RuntimeOutputJournalSnapshot> {
        try {
            if (!ownsPublication()) {
                return snapshot();
            }
            const source = await transport.inspect();
            if (!ownsPublication()) {
                return snapshot();
            }
            if (!source) {
                if (sourceIdentity !== null) {
                    throw new Error("Runtime output source disappeared during reading.");
                }
                return snapshot();
            }
            if (!source.identity || !Number.isSafeInteger(source.size) || source.size < 0) {
                throw new Error("Runtime output transport returned invalid source metadata.");
            }
            if (sourceIdentity === null) {
                sourceIdentity = source.identity;
                status = "reading";
            }
            if (source.identity !== sourceIdentity) {
                throw new Error("Runtime output journal was replaced.");
            }
            if (source.size < fileSize || source.size > journalLimit) {
                throw new Error("Runtime output journal shrank or exceeded its limit.");
            }
            fileSize = source.size;
            // Bound each poll to four reads; callers schedule subsequent polls.
            for (let count = 0; count < 4 && offset < fileSize; count++) {
                if (!ownsPublication()) {
                    break;
                }
                const length = Math.min(frameLimit, fileSize - offset);
                const bytes = await transport.read(offset, length);
                if (!ownsPublication()) {
                    break;
                }
                if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > length) {
                    throw new Error("Runtime output transport returned an invalid byte read.");
                }
                offset += bytes.length;
                consumeBytes(bytes);
            }
        } catch (error) {
            fail(error instanceof Error ? error.message : "Runtime output journal read failed.");
        } finally {
            if (status === "failed" || status === "retired" || status === "accepted") {
                await closeTransport();
            }
        }
        return snapshot();
    };

    const poll = function(): Promise<RuntimeOutputJournalSnapshot> {
        if (!inFlight) {
            inFlight = readAvailable().finally(() => {
                inFlight = null;
            });
        }
        return inFlight;
    };

    const finishCapturedProducer = async function(
        expected: RuntimeOutputProducerReceipt
    ): Promise<RuntimeOutputJournalSnapshot> {
        if (!ownsPublication()) {
            return snapshot();
        }
        if (
            expected.sessionId !== sessionId || expected.parentId !== parentId
            || expected.captureStatus !== "sealed"
        ) {
            fail("Runtime output producer receipt failed or has a different owner.");
            await inFlight;
            await closeTransport();
            return snapshot();
        }
        let result = await poll();
        while (result.hasUnreadBytes && ownsPublication()) {
            result = await poll();
        }
        let deliveryAccepted = false;
        if (ownsPublication()) {
            if (status !== "producer_sealed" || pending.length || expected.outputSequence !== lastSequence) {
                fail("Runtime output producer receipt does not match a complete sealed journal.");
            } else {
                status = "accepted";
                try {
                    deliveryAccepted = options.acceptSeal ? options.acceptSeal(lastSequence) === true : true;
                } catch {
                    fail("Runtime output seal publication failed.");
                }
            }
        }
        await closeTransport();
        if (deliveryAccepted) {
            await releaseAcceptedSource();
        }
        return snapshot();
    };

    const finishProducer = async function(
        receipt: RuntimeOutputProducerReceipt
    ): Promise<RuntimeOutputJournalSnapshot> {
        const expected = { ...receipt };
        if (!finishing) {
            producerReceipt = expected;
            finishing = finishCapturedProducer(expected);
        }
        else if (
            expected.sessionId !== producerReceipt?.sessionId
            || expected.parentId !== producerReceipt?.parentId
            || expected.captureStatus !== producerReceipt?.captureStatus
            || expected.outputSequence !== producerReceipt?.outputSequence
        ) {
            fail("Runtime output producer receipt changed after capture.");
        }
        // A byte seal is not a completed close/storage-release operation.
        // Matching callers join the one captured completion, never a replay.
        await finishing;
        return snapshot();
    };

    const retire = async function(): Promise<void> {
        status = "retired";
        pending = new Uint8Array(0);
        await inFlight;
        await finishing;
        await closeTransport();
    };

    return { poll, finishProducer, retire, snapshot };
};

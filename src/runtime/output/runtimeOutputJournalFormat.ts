// The JavaScript storage, reader and transcript consumer share one wire format.
export const runtimeOutputJournalFormat = Object.freeze({
    header: "DFOUT001",
    frameHeaderBytes: 13,
    maximumPayloadBytes: 65536,
    maximumJournalBytes: 64 * 1024 * 1024
});

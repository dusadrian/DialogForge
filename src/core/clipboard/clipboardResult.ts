export interface ClipboardBridge {
    readText: () => string;
    writeText: (text: string) => void;
}


export interface ClipboardResult {
    status: string;
    text: string;
    textLength: number;
    message: string;
    copiedAt: string;
}


interface CopyPayloadTextSource {
    text?: string;
}


interface ReadyCopyPayload extends CopyPayloadTextSource {
    status?: string;
}


export const createClipboardResult = function(input: Partial<ClipboardResult>): ClipboardResult {
    return {
        status: input.status || "unknown",
        text: input.text || "",
        textLength: input.text ? input.text.length : 0,
        message: input.message || "",
        copiedAt: new Date().toISOString()
    };
};


export const readCopyPayloadText = function(input: unknown): string {
    if (typeof input === "string") {
        return input;
    }

    if (input && typeof input === "object") {
        const payload = input as CopyPayloadTextSource;

        if (typeof payload.text === "string") {
            return payload.text;
        }
    }

    return JSON.stringify(input || "");
};


export const createCopiedClipboardResult = function(
    text: string,
    message = "Copy payload text was written to the system clipboard."
): ClipboardResult {
    return createClipboardResult({
        status: "copied",
        text,
        message
    });
};


export const writeCopyPayloadText = function(
    clipboard: ClipboardBridge,
    payload: ReadyCopyPayload | null | undefined
): ClipboardResult {
    if (!payload || payload.status !== "ready") {
        return createClipboardResult({
            status: "empty",
            text: "",
            message: "No ready copy payload is available."
        });
    }

    clipboard.writeText(payload.text || "");

    return createCopiedClipboardResult(payload.text || "");
};


export const readClipboardText = function(
    clipboard: ClipboardBridge
): ClipboardResult {
    const text = clipboard.readText();

    return createClipboardResult({
        status: text.length > 0 ? "ready" : "empty",
        text,
        message: text.length > 0 ? "Clipboard text was read." : "Clipboard text is empty."
    });
};

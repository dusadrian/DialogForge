export interface PastePayload {
    status: string;
    rows: string[][];
    width: number;
    height: number;
    message: string;
}


export const parseClipboardText = function(text: string): PastePayload {
    const normalized = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const trimmed = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;

    if (trimmed.length === 0) {
        return {
            status: "empty",
            rows: [],
            width: 0,
            height: 0,
            message: "Clipboard text is empty."
        };
    }

    const rows = trimmed.split("\n").map((line) => {
        return line.split("\t");
    });
    const width = rows.reduce((maximum, row) => {
        return Math.max(maximum, row.length);
    }, 0);

    return {
        status: "ready",
        rows,
        width,
        height: rows.length,
        message: "Clipboard text parsed."
    };
};


export const pastePayloadApi = {
    parseClipboardText
};

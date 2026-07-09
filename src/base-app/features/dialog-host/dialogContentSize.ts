export interface DialogContentSize {
    width: number;
    height: number;
}


interface DialogContentSource {
    source?: {
        properties?: unknown;
    };
}


export const createDialogContentApiPath = function(dialogId: unknown): string {
    return `/api/dialog/${encodeURIComponent(String(dialogId || ""))}`;
};


export const readDialogContentSize = function(
    properties: unknown
): DialogContentSize {
    const record = properties && typeof properties === "object"
        ? properties as { width?: unknown; height?: unknown }
        : {};
    const width = Math.max(200, Math.round(Number(record.width) || 640));
    const height = Math.max(120, Math.round(Number(record.height) || 480));

    return {
        width,
        height
    };
};


export const readDialogContentSizeFromSource = function(
    source: DialogContentSource | null | undefined
): DialogContentSize {
    return readDialogContentSize(source?.source?.properties);
};

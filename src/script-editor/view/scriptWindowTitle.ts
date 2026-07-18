export interface ScriptWindowTitleDocument {
    filePath: string;
    displayName?: string;
    dirty: boolean;
}


export interface ScriptWindowTitleLabels {
    untitled: string;
    scriptEditor: string;
}


const basename = function(value: string): string {
    return String(value || "").replace(/\\/g, "/").split("/").filter(Boolean).pop() || "";
};


export const formatScriptWindowTitle = function(
    document: ScriptWindowTitleDocument | null | undefined,
    labels: ScriptWindowTitleLabels
): string {
    const fileLabel = document?.displayName
        || (document?.filePath ? basename(document.filePath) : labels.untitled);
    const dirtyMarker = document?.dirty ? " •" : "";

    return `${fileLabel}${dirtyMarker} - ${labels.scriptEditor}`;
};

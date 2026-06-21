import path = require("path");


export interface ScriptWindowTitleDocument {
    filePath: string;
    dirty: boolean;
}


export interface ScriptWindowTitleLabels {
    untitled: string;
    scriptEditor: string;
}


export const formatScriptWindowTitle = function(
    document: ScriptWindowTitleDocument | null | undefined,
    labels: ScriptWindowTitleLabels
): string {
    const fileLabel = document?.filePath
        ? path.basename(document.filePath)
        : labels.untitled;
    const dirtyMarker = document?.dirty ? " •" : "";

    return `${fileLabel}${dirtyMarker} - ${labels.scriptEditor}`;
};

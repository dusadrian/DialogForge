export interface DatasetEditorKeyboardInput {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    shiftKey?: boolean;
    targetTagName: string;
    targetId: string;
    targetIsContentEditable: boolean;
    selectionKind?: string;
}


const isEditableTarget = function(input: DatasetEditorKeyboardInput): boolean {
    const tagName = input.targetTagName.toLowerCase();

    return input.targetIsContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
};


export const getDatasetEditorKeyboardCommand = function(input: DatasetEditorKeyboardInput): string {
    if (input.altKey || input.shiftKey) {
        return "";
    }

    const modifier = input.ctrlKey || input.metaKey;
    const key = input.key.toLowerCase();
    const targetId = input.targetId || "";

    if (!modifier && key === "escape" && (targetId === "cellValue" || targetId === "variableMetadataValue")) {
        return "dataset.cancelEdit";
    }

    if (!modifier && key === "enter" && (targetId === "cellValue" || targetId === "variableMetadataValue")) {
        return "dataset.commitEdit";
    }

    if (!modifier && key === "enter" && !isEditableTarget(input)) {
        return "dataset.beginEdit";
    }

    if (!modifier && key === "escape" && !isEditableTarget(input)) {
        return "dataset.cancelEdit";
    }

    if (isEditableTarget(input)) {
        return "";
    }

    if (modifier && key === "t") {
        return "dataset.toggleTab";
    }

    if (modifier && key === "c") {
        return "dataset.copy";
    }

    if (modifier && key === "v") {
        return "dataset.pasteFromClipboard";
    }

    return "";
};


export const keyboardCommandsApi = {
    getDatasetEditorKeyboardCommand
};

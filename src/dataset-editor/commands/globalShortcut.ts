export type DatasetEditorGlobalShortcut =
    | "none"
    | "allow-font-shortcut"
    | "hide-header-menu"
    | "hide-row-menu"
    | "copy-selected-column"
    | "paste-selected-column"
    | "copy-active-cell"
    | "paste-active-cell"
    | "toggle-tab"
    | "close-value-labels";


export interface DatasetEditorGlobalShortcutInput {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    fontShortcut: boolean;
    headerMenuOpen: boolean;
    rowMenuOpen: boolean;
    valueLabelsOpen: boolean;
    dataTabActive: boolean;
    dataColumnSelected: boolean;
    inputTextSelected: boolean;
    variableRangeSelected: boolean;
}


export const isDatasetEditorFontShortcutKey = function(
    event: Pick<KeyboardEvent, "key" | "code">
): boolean {
    const keyText = String(event.key || "");
    const codeText = String(event.code || "");

    return keyText === "+" ||
        keyText === "=" ||
        keyText === "Add" ||
        keyText === "-" ||
        keyText === "_" ||
        keyText === "Subtract" ||
        keyText === "0" ||
        codeText === "Equal" ||
        codeText === "NumpadAdd" ||
        codeText === "Minus" ||
        codeText === "NumpadSubtract" ||
        codeText === "Digit0" ||
        codeText === "Numpad0";
};


export const resolveDatasetEditorGlobalShortcut = function(
    input: DatasetEditorGlobalShortcutInput
): DatasetEditorGlobalShortcut {
    if (input.key === "Escape" && input.headerMenuOpen) {
        return "hide-header-menu";
    }

    if (input.key === "Escape" && input.rowMenuOpen) {
        return "hide-row-menu";
    }

    const modifier = input.ctrlKey || input.metaKey;

    if (modifier && !input.altKey && input.fontShortcut) {
        return "allow-font-shortcut";
    }

    const shortcutKey = String(input.key || "").toLowerCase();
    const clipboardShortcut = modifier &&
        !input.altKey &&
        !input.shiftKey &&
        (shortcutKey === "c" || shortcutKey === "v");

    if (clipboardShortcut) {
        const isCopy = shortcutKey === "c";

        if (
            input.dataTabActive &&
            input.dataColumnSelected &&
            !(isCopy && input.inputTextSelected)
        ) {
            return isCopy
                ? "copy-selected-column"
                : "paste-selected-column";
        }

        if (
            !(isCopy &&
                input.inputTextSelected &&
                !input.variableRangeSelected)
        ) {
            return isCopy ? "copy-active-cell" : "paste-active-cell";
        }
    }

    if (
        modifier &&
        !input.altKey &&
        !input.shiftKey &&
        shortcutKey === "t"
    ) {
        return "toggle-tab";
    }

    if (input.key === "Escape" && input.valueLabelsOpen) {
        return "close-value-labels";
    }

    return "none";
};

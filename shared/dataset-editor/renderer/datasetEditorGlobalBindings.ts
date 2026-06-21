import {
    resolveDatasetEditorGlobalShortcut
} from "../commands/globalShortcut";


export interface DatasetEditorGlobalBindingState {
    headerMenuOpen: boolean;
    rowMenuOpen: boolean;
    valueLabelsOpen: boolean;
    dataTabActive: boolean;
    dataColumnSelected: boolean;
    variableRangeSelected: boolean;
}


export interface DatasetEditorGlobalBindingActions {
    hideHeaderMenu(): void;
    hideRowMenu(): void;
    copySelectedColumn(): void;
    pasteSelectedColumn(): void;
    copyActiveCell(): void;
    pasteActiveCell(): void;
    toggleTab(): void;
    closeValueLabels(): void;
    resized(): void;
}


export interface DatasetEditorGlobalBindingOptions {
    isFontShortcut(event: KeyboardEvent): boolean;
    readState(): DatasetEditorGlobalBindingState;
    actions: DatasetEditorGlobalBindingActions;
}


const inputHasSelection = function(
    target: EventTarget | null
): boolean {
    if (
        !(target instanceof HTMLInputElement)
        && !(target instanceof HTMLTextAreaElement)
    ) {
        return false;
    }

    return Number(target.selectionStart ?? 0)
        !== Number(target.selectionEnd ?? 0);
};


export const bindDatasetEditorGlobalEvents = function(
    options: DatasetEditorGlobalBindingOptions
): void {
    window.addEventListener("resize", () => {
        options.actions.resized();
    });

    window.addEventListener("keydown", (event) => {
        const state = options.readState();
        const shortcut = resolveDatasetEditorGlobalShortcut({
            key: event.key,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            altKey: event.altKey,
            shiftKey: event.shiftKey,
            fontShortcut: options.isFontShortcut(event),
            headerMenuOpen: state.headerMenuOpen,
            rowMenuOpen: state.rowMenuOpen,
            valueLabelsOpen: state.valueLabelsOpen,
            dataTabActive: state.dataTabActive,
            dataColumnSelected: state.dataColumnSelected,
            inputTextSelected: inputHasSelection(event.target),
            variableRangeSelected: state.variableRangeSelected
        });

        if (shortcut === "hide-header-menu") {
            event.preventDefault();
            options.actions.hideHeaderMenu();
            return;
        }

        if (shortcut === "hide-row-menu") {
            event.preventDefault();
            options.actions.hideRowMenu();
            return;
        }

        if (
            shortcut === "allow-font-shortcut"
            || shortcut === "none"
        ) {
            return;
        }

        event.preventDefault();

        if (shortcut === "copy-selected-column") {
            options.actions.copySelectedColumn();
            return;
        }

        if (shortcut === "paste-selected-column") {
            options.actions.pasteSelectedColumn();
            return;
        }

        if (shortcut === "copy-active-cell") {
            options.actions.copyActiveCell();
            return;
        }

        if (shortcut === "paste-active-cell") {
            options.actions.pasteActiveCell();
            return;
        }

        if (shortcut === "toggle-tab") {
            event.stopPropagation();
            options.actions.toggleTab();
            return;
        }

        if (shortcut === "close-value-labels") {
            options.actions.closeValueLabels();
        }
    });
};

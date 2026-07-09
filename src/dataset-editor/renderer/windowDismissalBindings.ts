export interface DatasetEditorDismissalState {
    headerMenuOpen: boolean;
    rowMenuOpen: boolean;
    variableRowMenuOpen: boolean;
    cellMenuOpen: boolean;
}


export interface DatasetEditorDismissalBindings {
    readState(): DatasetEditorDismissalState;
    hideHeaderMenu(): void;
    hideRowMenu(): void;
    hideVariableRowMenu(): void;
    hideCellMenu(): void;
    clearSelection(): void;
}


const keepsDatasetSelection = function(target: HTMLElement | null): boolean {
    return Boolean(
        target?.closest("[data-data-header]")
        || target?.closest("[data-row-name]")
        || target?.closest('[data-data-cell="true"]')
        || target?.closest("#datasetEditorVariablesScroll")
    );
};


export const bindDatasetEditorWindowDismissal = function(
    bindings: DatasetEditorDismissalBindings
): void {
    window.addEventListener("mousedown", (event) => {
        const target = event.target as HTMLElement | null;
        const state = bindings.readState();

        if (
            state.headerMenuOpen
            && !target?.closest("#datasetEditorHeaderMenu")
        ) {
            bindings.hideHeaderMenu();
        }

        if (
            state.rowMenuOpen
            && !target?.closest("#datasetEditorRowMenu")
        ) {
            bindings.hideRowMenu();
        }

        if (
            state.variableRowMenuOpen
            && !target?.closest("#datasetEditorVariableRowMenu")
        ) {
            bindings.hideVariableRowMenu();
        }

        if (
            state.cellMenuOpen
            && !target?.closest("#datasetEditorCellMenu")
        ) {
            bindings.hideCellMenu();
        }

        if (event.button !== 0 || keepsDatasetSelection(target)) {
            return;
        }

        bindings.clearSelection();
    });
};

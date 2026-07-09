import type {
    DatasetEditorGlobalBindingOptions
} from "./datasetEditorGlobalBindings";
import type {
    DatasetEditorDismissalBindings
} from "./windowDismissalBindings";


export interface DatasetEditorWindowInteractionOptions {
    isFontShortcut(event: KeyboardEvent): boolean;
    getActiveTab(): "data" | "variables";
    setActiveTab(tab: "data" | "variables"): void;
    getSelectedColumn(): string;
    hasVariableRangeSelection(): boolean;
    isValueLabelsEditorOpen(): boolean;
    isHeaderMenuOpen(): boolean;
    isRowMenuOpen(): boolean;
    isVariableRowMenuOpen(): boolean;
    isCellMenuOpen(): boolean;
    hideHeaderMenu(): void;
    hideRowMenu(): void;
    hideVariableRowMenu(): void;
    hideCellMenu(): void;
    closeValueLabelsEditor(): void;
    copySelectedColumn(columnName: string): void | Promise<unknown>;
    pasteSelectedColumn(columnName: string): void | Promise<unknown>;
    copyActiveCell(): void | Promise<unknown>;
    pasteActiveCell(): void | Promise<unknown>;
    clearSelection(): void;
    markDataViewportActivity(): void;
    queueViewportRefresh(): void;
}


export interface DatasetEditorWindowInteractions {
    globalEvents: DatasetEditorGlobalBindingOptions;
    dismissal: DatasetEditorDismissalBindings;
}


export const createDatasetEditorWindowInteractionController = function(
    options: DatasetEditorWindowInteractionOptions
): DatasetEditorWindowInteractions {
    const globalEvents: DatasetEditorGlobalBindingOptions = {
        isFontShortcut: options.isFontShortcut,
        readState: () => ({
            headerMenuOpen: options.isHeaderMenuOpen(),
            rowMenuOpen: options.isRowMenuOpen(),
            valueLabelsOpen: options.isValueLabelsEditorOpen(),
            dataTabActive: options.getActiveTab() === "data",
            dataColumnSelected: Boolean(options.getSelectedColumn()),
            variableRangeSelected: options.hasVariableRangeSelection()
        }),
        actions: {
            hideHeaderMenu: options.hideHeaderMenu,
            hideRowMenu: options.hideRowMenu,
            copySelectedColumn: () => {
                void options.copySelectedColumn(
                    options.getSelectedColumn()
                );
            },
            pasteSelectedColumn: () => {
                void options.pasteSelectedColumn(
                    options.getSelectedColumn()
                );
            },
            copyActiveCell: () => {
                void options.copyActiveCell();
            },
            pasteActiveCell: () => {
                void options.pasteActiveCell();
            },
            toggleTab: () => {
                options.setActiveTab(
                    options.getActiveTab() === "data"
                        ? "variables"
                        : "data"
                );
            },
            closeValueLabels: options.closeValueLabelsEditor,
            resized: () => {
                if (options.getActiveTab() !== "data") {
                    return;
                }

                options.markDataViewportActivity();
                options.queueViewportRefresh();
            }
        }
    };

    const dismissal: DatasetEditorDismissalBindings = {
        readState: () => ({
            headerMenuOpen: options.isHeaderMenuOpen(),
            rowMenuOpen: options.isRowMenuOpen(),
            variableRowMenuOpen: options.isVariableRowMenuOpen(),
            cellMenuOpen: options.isCellMenuOpen()
        }),
        hideHeaderMenu: options.hideHeaderMenu,
        hideRowMenu: options.hideRowMenu,
        hideVariableRowMenu: options.hideVariableRowMenu,
        hideCellMenu: options.hideCellMenu,
        clearSelection: options.clearSelection
    };

    return {
        globalEvents,
        dismissal
    };
};

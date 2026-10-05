import type {
    DatasetEditorContextMenuBindings
} from "../context-menus/contextMenuBindings";
import type {
    DatasetEditorContextMenuView
} from "./datasetEditorContextMenuView";
import { runDatasetEditorEventAction } from "./datasetEditorEventAction";


export interface DatasetEditorContextMenuActionOptions {
    copyColumn(
        columnName: string,
        options?: {
            includeLabels?: boolean;
        }
    ): void | Promise<unknown>;
    pasteColumn(columnName: string): void | Promise<unknown>;
    sortColumn(
        columnName: string,
        decreasing: boolean
    ): void | Promise<unknown>;
    renameColumn(columnName: string): void;
    insertColumn(
        columnName: string,
        position: "before" | "after"
    ): void | Promise<unknown>;
    removeColumn(columnName: string): void | Promise<unknown>;
    insertRow(
        rowNumber: number,
        position: "before" | "after"
    ): void | Promise<unknown>;
    renameRow(rowNumber: number): void;
    removeRow(rowNumber: number): void | Promise<unknown>;
    copyCell(): void | Promise<unknown>;
    pasteCell(): void | Promise<unknown>;
}


export const createDatasetEditorContextMenuBindingController = function<
    TCellTarget
>(
    document: Document,
    contextMenus: DatasetEditorContextMenuView<TCellTarget>,
    actions: DatasetEditorContextMenuActionOptions
): DatasetEditorContextMenuBindings {
    const elementById = function(id: string): HTMLElement | null {
        return document.getElementById(id);
    };

    return {
        headerMenu: elementById("datasetEditorHeaderMenu"),
        rowMenu: elementById("datasetEditorRowMenu"),
        variableRowMenu: elementById("datasetEditorVariableRowMenu"),
        cellMenu: elementById("datasetEditorCellMenu"),
        getHeaderColumn: () => contextMenus.headerColumn,
        getRowNumber: () => contextMenus.rowNumber,
        getVariableRowColumn: () => contextMenus.variableRowColumn,
        hideHeaderMenu: contextMenus.hideHeader,
        hideRowMenu: contextMenus.hideRow,
        hideVariableRowMenu: contextMenus.hideVariableRow,
        hideCellMenu: contextMenus.hideCell,
        copyColumn: (columnName, options) => {
            void runDatasetEditorEventAction("copy-column", () => actions.copyColumn(columnName, options));
        },
        pasteColumn: (columnName) => {
            void runDatasetEditorEventAction("paste-column", () => actions.pasteColumn(columnName));
        },
        sortColumn: (columnName, decreasing) => {
            void runDatasetEditorEventAction("sort-column", () => actions.sortColumn(columnName, decreasing));
        },
        renameColumn: (columnName) => {
            void runDatasetEditorEventAction("rename-column", () => actions.renameColumn(columnName));
        },
        insertColumn: (columnName, position) => {
            void runDatasetEditorEventAction("insert-column", () => actions.insertColumn(columnName, position));
        },
        removeColumn: (columnName) => {
            void runDatasetEditorEventAction("remove-column", () => actions.removeColumn(columnName));
        },
        insertRow: (rowNumber, position) => {
            void runDatasetEditorEventAction("insert-row", () => actions.insertRow(rowNumber, position));
        },
        renameRow: (rowNumber) => {
            void runDatasetEditorEventAction("rename-row", () => actions.renameRow(rowNumber));
        },
        removeRow: (rowNumber) => {
            void runDatasetEditorEventAction("remove-row", () => actions.removeRow(rowNumber));
        },
        copyCell: () => {
            void runDatasetEditorEventAction("copy-cell", () => actions.copyCell());
        },
        pasteCell: () => {
            void runDatasetEditorEventAction("paste-cell", () => actions.pasteCell());
        }
    };
};

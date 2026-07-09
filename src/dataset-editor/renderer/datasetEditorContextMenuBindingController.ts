import type {
    DatasetEditorContextMenuBindings
} from "../context-menus/contextMenuBindings";
import type {
    DatasetEditorContextMenuView
} from "./datasetEditorContextMenuView";


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
            void actions.copyColumn(columnName, options);
        },
        pasteColumn: (columnName) => {
            void actions.pasteColumn(columnName);
        },
        sortColumn: (columnName, decreasing) => {
            void actions.sortColumn(columnName, decreasing);
        },
        renameColumn: actions.renameColumn,
        insertColumn: (columnName, position) => {
            void actions.insertColumn(columnName, position);
        },
        removeColumn: (columnName) => {
            void actions.removeColumn(columnName);
        },
        insertRow: (rowNumber, position) => {
            void actions.insertRow(rowNumber, position);
        },
        renameRow: actions.renameRow,
        removeRow: (rowNumber) => {
            void actions.removeRow(rowNumber);
        },
        copyCell: () => {
            void actions.copyCell();
        },
        pasteCell: () => {
            void actions.pasteCell();
        }
    };
};

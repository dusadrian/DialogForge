import {
    bindDataGridSelection,
    type DataGridCell
} from "../selection/dataGridSelection";
import {
    bindDataGridEditActions,
    type DataGridEditBindingsOptions
} from "./dataGridEditBindings";


export interface DataGridInteractionBindingsOptions {
    window: Window;
    isColumnEditing(columnName: string): boolean;
    isRowEditing(rowNumber: number): boolean;
    selectColumn(columnName: string, render: boolean): void;
    selectRow(rowNumber: number, render: boolean): void;
    selectCell(cell: DataGridCell, render: boolean): void;
    showColumnMenu(
        columnName: string,
        clientX: number,
        clientY: number
    ): void;
    showRowMenu(
        rowNumber: number,
        clientX: number,
        clientY: number
    ): void;
    showCellMenu(
        cell: DataGridCell,
        clientX: number,
        clientY: number
    ): void;
    openVariable(columnName: string): void;
    editRowName(rowNumber: number): void;
    beginCellEdit(cell: DataGridCell): void;
    render(): void;
    edits: Omit<DataGridEditBindingsOptions, "host">;
}


export interface DataGridInteractionBindings {
    bind(host: HTMLElement): void;
}


export const createDataGridInteractionBindings = function(
    options: DataGridInteractionBindingsOptions
): DataGridInteractionBindings {
    const beginCellEdit = function(
        host: HTMLElement,
        cell: DataGridCell
    ): void {
        options.beginCellEdit(cell);
        options.render();
        options.window.requestAnimationFrame(() => {
            const input = host.querySelector<HTMLInputElement>(
                '[data-data-editor="true"]'
            );

            if (!input) {
                return;
            }

            try {
                options.window.getSelection?.()?.removeAllRanges?.();
            } catch {}

            input.focus();
            const length = String(input.value || "").length;

            try {
                input.setSelectionRange(length, length);
            } catch {}
        });
    };

    const bind = function(host: HTMLElement): void {
        bindDataGridSelection({
            host,
            isColumnEditing: options.isColumnEditing,
            isRowEditing: options.isRowEditing,
            selectColumn: options.selectColumn,
            selectRow: options.selectRow,
            selectCell: options.selectCell,
            showColumnMenu: options.showColumnMenu,
            showRowMenu: options.showRowMenu,
            showCellMenu: options.showCellMenu,
            openVariable: options.openVariable,
            editRowName: options.editRowName,
            editCell: (cell) => {
                beginCellEdit(host, cell);
            }
        });

        bindDataGridEditActions({
            host,
            ...options.edits
        });
    };

    return {
        bind
    };
};

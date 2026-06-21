export interface DataGridCell {
    row: number;
    column: string;
}


export interface DataGridSelectionBindings {
    host: HTMLElement;
    isColumnEditing: (columnName: string) => boolean;
    isRowEditing: (rowNumber: number) => boolean;
    selectColumn: (columnName: string, render: boolean) => void;
    selectRow: (rowNumber: number, render: boolean) => void;
    selectCell: (cell: DataGridCell, render: boolean) => void;
    showColumnMenu: (
        columnName: string,
        clientX: number,
        clientY: number
    ) => void;
    showRowMenu: (
        rowNumber: number,
        clientX: number,
        clientY: number
    ) => void;
    showCellMenu: (
        cell: DataGridCell,
        clientX: number,
        clientY: number
    ) => void;
    openVariable: (columnName: string) => void;
    editRowName: (rowNumber: number) => void;
    editCell: (cell: DataGridCell) => void;
}


const clearBrowserSelection = function(): void {
    try {
        window.getSelection?.()?.removeAllRanges?.();
    } catch {}
};


const columnName = function(cell: HTMLElement): string {
    return String(cell.getAttribute("data-data-header") || "");
};


const rowNumber = function(cell: HTMLElement): number {
    return Number(cell.getAttribute("data-row-name") || 0);
};


const dataCell = function(cell: HTMLElement): DataGridCell | null {
    const row = Number(cell.getAttribute("data-data-row") || 0);
    const column = String(
        cell.getAttribute("data-data-column") || ""
    );

    return row && column
        ? {
            row,
            column
        }
        : null;
};


const bindColumnHeaders = function(
    bindings: DataGridSelectionBindings
): void {
    bindings.host
        .querySelectorAll<HTMLElement>("[data-data-header]")
        .forEach((cell) => {
            cell.addEventListener("contextmenu", (event) => {
                event.preventDefault();
                const column = columnName(cell);

                if (!column || bindings.isColumnEditing(column)) {
                    return;
                }

                bindings.selectColumn(column, true);
                bindings.showColumnMenu(
                    column,
                    event.clientX,
                    event.clientY
                );
            });
            cell.addEventListener("mousedown", (event) => {
                const column = columnName(cell);

                if (
                    !column ||
                    (event.target as HTMLElement | null)?.closest(
                        "[data-header-editor=\"true\"]"
                    ) ||
                    bindings.isColumnEditing(column)
                ) {
                    return;
                }

                bindings.selectColumn(column, false);
            });
            cell.addEventListener("click", (event) => {
                const column = columnName(cell);

                if (
                    !column ||
                    (event.target as HTMLElement | null)?.closest(
                        "[data-header-editor=\"true\"]"
                    ) ||
                    bindings.isColumnEditing(column)
                ) {
                    return;
                }

                bindings.selectColumn(column, true);
            });
            cell.addEventListener("dblclick", (event) => {
                event.preventDefault();
                clearBrowserSelection();
                const column = columnName(cell);

                if (column) {
                    bindings.openVariable(column);
                }
            });
        });
};


const bindRowHeaders = function(
    bindings: DataGridSelectionBindings
): void {
    bindings.host
        .querySelectorAll<HTMLElement>("[data-row-name]")
        .forEach((cell) => {
            cell.addEventListener("contextmenu", (event) => {
                event.preventDefault();
                event.stopPropagation();
                const row = rowNumber(cell);

                if (!row || bindings.isRowEditing(row)) {
                    return;
                }

                bindings.selectRow(row, true);
                bindings.showRowMenu(
                    row,
                    event.clientX,
                    event.clientY
                );
            });
            cell.addEventListener("mousedown", (event) => {
                const row = rowNumber(cell);

                if (
                    !row ||
                    (event.target as HTMLElement | null)?.closest(
                        "[data-rowname-editor=\"true\"]"
                    ) ||
                    bindings.isRowEditing(row)
                ) {
                    return;
                }

                bindings.selectRow(row, false);
            });
            cell.addEventListener("click", (event) => {
                const row = rowNumber(cell);

                if (
                    !row ||
                    (event.target as HTMLElement | null)?.closest(
                        "[data-rowname-editor=\"true\"]"
                    ) ||
                    bindings.isRowEditing(row)
                ) {
                    return;
                }

                bindings.selectRow(row, true);
            });
            cell.addEventListener("dblclick", (event) => {
                event.preventDefault();
                event.stopPropagation();
                clearBrowserSelection();
                const row = rowNumber(cell);

                if (row) {
                    bindings.editRowName(row);
                }
            });
        });
};


const bindDataCells = function(
    bindings: DataGridSelectionBindings
): void {
    bindings.host
        .querySelectorAll<HTMLElement>("[data-data-cell=\"true\"]")
        .forEach((cell) => {
            cell.addEventListener("contextmenu", (event) => {
                event.preventDefault();
                const target = dataCell(cell);

                if (!target) {
                    return;
                }

                bindings.selectCell(target, false);
                bindings.showCellMenu(
                    target,
                    event.clientX,
                    event.clientY
                );
            });
            cell.addEventListener("mousedown", () => {
                const target = dataCell(cell);

                if (target) {
                    bindings.selectCell(target, false);
                }
            });
            cell.addEventListener("click", () => {
                const target = dataCell(cell);

                if (target) {
                    bindings.selectCell(target, true);
                }
            });
            cell.addEventListener("dblclick", (event) => {
                event.preventDefault();
                const target = dataCell(cell);

                if (target) {
                    bindings.selectCell(target, false);
                    bindings.editCell(target);
                }
            });
        });
};


export const bindDataGridSelection = function(
    bindings: DataGridSelectionBindings
): void {
    bindColumnHeaders(bindings);
    bindRowHeaders(bindings);
    bindDataCells(bindings);
};

export interface DataGridCellTarget {
    row: number;
    column: string;
}


export interface DataGridInteractionSnapshot {
    selectedColumn: string;
    selectedRow: number;
    activeCell: DataGridCellTarget | null;
    activeCellEdit: DataGridCellTarget | null;
    activeColumnEdit: string | null;
    activeRowNameEdit: number | null;
}


export interface DataGridInteractionState {
    readonly snapshot: DataGridInteractionSnapshot;
    selectColumn(column: string): void;
    selectRow(row: number): void;
    selectCell(cell: DataGridCellTarget): void;
    beginCellEdit(cell: DataGridCellTarget): void;
    beginColumnEdit(column: string): void;
    beginRowNameEdit(row: number): void;
    resetAfterSort(column: string): void;
    clearActiveCell(): void;
    clearCellEdit(): void;
    clearColumnEdit(): void;
    clearRowNameEdit(): void;
    clearEditing(): void;
    clearJumpSelection(hasVariableSelection: boolean): boolean;
    renameColumn(previousName: string, nextName: string): void;
    removeColumn(column: string): void;
    reset(): void;
}


const copyCell = function(
    cell: DataGridCellTarget
): DataGridCellTarget {
    return {
        row: cell.row,
        column: cell.column
    };
};


export const createDataGridInteractionState = function(): DataGridInteractionState {
    const snapshot: DataGridInteractionSnapshot = {
        selectedColumn: "",
        selectedRow: 0,
        activeCell: null,
        activeCellEdit: null,
        activeColumnEdit: null,
        activeRowNameEdit: null
    };

    const clearActiveCell = function(): void {
        snapshot.activeCell = null;
        snapshot.activeCellEdit = null;
    };

    const reset = function(): void {
        snapshot.selectedColumn = "";
        snapshot.selectedRow = 0;
        snapshot.activeCell = null;
        snapshot.activeCellEdit = null;
        snapshot.activeColumnEdit = null;
        snapshot.activeRowNameEdit = null;
    };

    const clearEditing = function(): void {
        snapshot.activeCellEdit = null;
        snapshot.activeColumnEdit = null;
        snapshot.activeRowNameEdit = null;
    };

    return {
        snapshot,
        selectColumn: (column) => {
            snapshot.selectedColumn = column;
            snapshot.selectedRow = 0;
            clearActiveCell();
        },
        selectRow: (row) => {
            snapshot.selectedRow = row;
            snapshot.selectedColumn = "";
            clearActiveCell();
        },
        selectCell: (cell) => {
            snapshot.activeCell = copyCell(cell);
            snapshot.selectedRow = 0;
            snapshot.selectedColumn = "";
        },
        beginCellEdit: (cell) => {
            snapshot.activeCellEdit = copyCell(cell);
        },
        beginColumnEdit: (column) => {
            snapshot.activeColumnEdit = column;
        },
        beginRowNameEdit: (row) => {
            snapshot.activeRowNameEdit = row;
            snapshot.selectedRow = row;
            snapshot.selectedColumn = "";
            snapshot.activeCellEdit = null;
            snapshot.activeColumnEdit = null;
        },
        resetAfterSort: (column) => {
            snapshot.selectedColumn = column;
            snapshot.activeCell = null;
            snapshot.activeCellEdit = null;
            snapshot.activeRowNameEdit = null;
        },
        clearActiveCell,
        clearCellEdit: () => {
            snapshot.activeCellEdit = null;
        },
        clearColumnEdit: () => {
            snapshot.activeColumnEdit = null;
        },
        clearRowNameEdit: () => {
            snapshot.activeRowNameEdit = null;
        },
        clearEditing,
        clearJumpSelection: (hasVariableSelection) => {
            if (
                snapshot.activeColumnEdit ||
                snapshot.activeRowNameEdit !== null ||
                snapshot.activeCellEdit
            ) {
                return false;
            }

            if (
                !snapshot.selectedColumn &&
                snapshot.selectedRow < 1 &&
                !snapshot.activeCell &&
                !hasVariableSelection
            ) {
                return false;
            }

            snapshot.selectedColumn = "";
            snapshot.selectedRow = 0;
            snapshot.activeCell = null;
            return true;
        },
        renameColumn: (previousName, nextName) => {
            if (snapshot.selectedColumn === previousName) {
                snapshot.selectedColumn = nextName;
            }

            if (snapshot.activeCell?.column === previousName) {
                snapshot.activeCell = {
                    ...snapshot.activeCell,
                    column: nextName
                };
            }

            if (snapshot.activeCellEdit?.column === previousName) {
                snapshot.activeCellEdit = {
                    ...snapshot.activeCellEdit,
                    column: nextName
                };
            }

            if (snapshot.activeColumnEdit === previousName) {
                snapshot.activeColumnEdit = nextName;
            }
        },
        removeColumn: (column) => {
            if (snapshot.selectedColumn === column) {
                snapshot.selectedColumn = "";
            }

            if (snapshot.activeCell?.column === column) {
                snapshot.activeCell = null;
            }

            if (snapshot.activeCellEdit?.column === column) {
                snapshot.activeCellEdit = null;
            }

            if (snapshot.activeColumnEdit === column) {
                snapshot.activeColumnEdit = null;
            }
        },
        reset
    };
};

export interface VariableGridCell<Key extends string = string> {
    rowIndex: number;
    key: Key;
}


export interface VariableGridRange<Key extends string = string> {
    key: Key;
    anchorRow: number;
    focusRow: number;
}


export interface VariableGridSelectionState<Key extends string = string> {
    selectedRowIndex: number;
    activeRowIndex: number;
    activeCell: VariableGridCell<Key> | null;
    range: VariableGridRange<Key> | null;
}


export interface VariableGridSelectionBindings<Key extends string = string> {
    host: HTMLElement;
    table: HTMLElement;
    getState: () => VariableGridSelectionState<Key>;
    setState: (state: VariableGridSelectionState<Key>) => void;
    clearActiveDataCell: () => void;
    isMultiPasteKey: (key: Key) => boolean;
    selectedRows: (key: Key, rowIndex: number) => number[];
    variableNameAt: (rowIndex: number) => string;
    showCellMenu: (
        cell: VariableGridCell<Key>,
        selectionRows: number[],
        clientX: number,
        clientY: number
    ) => void;
    showRowMenu: (
        variableName: string,
        clientX: number,
        clientY: number
    ) => void;
}


const variableCellFromTarget = function<Key extends string>(
    target: EventTarget | null
): VariableGridCell<Key> | null {
    const element = target as HTMLElement | null;
    const cell = element?.closest<HTMLElement>("[data-variable-cell]");

    if (cell) {
        const rowIndex = Number(
            cell.getAttribute("data-variable-row") || -1
        );
        const key = String(
            cell.getAttribute("data-variable-cell") || ""
        ) as Key;

        return rowIndex >= 0 && key
            ? {
                rowIndex,
                key
            }
            : null;
    }

    const field = element?.closest<HTMLElement>("[data-variable-field]");

    if (!field) {
        return null;
    }

    const rowIndex = Number(
        field.getAttribute("data-variable-row") || -1
    );
    const key = String(
        field.getAttribute("data-variable-field") || ""
    ) as Key;

    return rowIndex >= 0 && key
        ? {
            rowIndex,
            key
        }
        : null;
};


const cellSelected = function<Key extends string>(
    state: VariableGridSelectionState<Key>,
    rowIndex: number,
    key: Key
): boolean {
    if (state.range && state.range.key === key) {
        const start = Math.min(
            state.range.anchorRow,
            state.range.focusRow
        );
        const end = Math.max(
            state.range.anchorRow,
            state.range.focusRow
        );

        return rowIndex >= start && rowIndex <= end;
    }

    return state.activeCell?.rowIndex === rowIndex &&
        state.activeCell.key === key;
};


const renderSelection = function<Key extends string>(
    bindings: VariableGridSelectionBindings<Key>
): void {
    const state = bindings.getState();

    bindings.host
        .querySelectorAll<HTMLElement>("tr[data-variable-row]")
        .forEach((row) => {
            row.classList.toggle(
                "is-selected",
                Number(row.getAttribute("data-variable-row") || -1) ===
                    state.selectedRowIndex
            );
        });
    bindings.host
        .querySelectorAll<HTMLElement>("[data-variable-row-index]")
        .forEach((cell) => {
            const rowIndex = Number(
                cell.getAttribute("data-variable-row-index") || -1
            );

            cell.classList.toggle(
                "is-active-row-index",
                rowIndex === state.activeRowIndex ||
                    rowIndex === state.selectedRowIndex
            );
        });
    bindings.host
        .querySelectorAll<HTMLElement>("[data-variable-cell]")
        .forEach((cell) => {
            const rowIndex = Number(
                cell.getAttribute("data-variable-row") || -1
            );
            const key = String(
                cell.getAttribute("data-variable-cell") || ""
            ) as Key;

            cell.classList.toggle(
                "is-cell-selected",
                rowIndex >= 0 && !!key && cellSelected(state, rowIndex, key)
            );
        });
};


const selectRow = function<Key extends string>(
    bindings: VariableGridSelectionBindings<Key>,
    rowIndex: number
): void {
    if (rowIndex < 0) {
        return;
    }

    bindings.clearActiveDataCell();
    bindings.setState({
        selectedRowIndex: rowIndex,
        activeRowIndex: rowIndex,
        activeCell: null,
        range: null
    });
    renderSelection(bindings);
};


const activateRow = function<Key extends string>(
    bindings: VariableGridSelectionBindings<Key>,
    rowIndex: number
): void {
    if (rowIndex < 0) {
        return;
    }

    const state = bindings.getState();

    bindings.clearActiveDataCell();
    bindings.setState({
        ...state,
        selectedRowIndex: -1,
        activeRowIndex: rowIndex
    });
    renderSelection(bindings);
};


const anchorCell = function<Key extends string>(
    bindings: VariableGridSelectionBindings<Key>,
    cell: VariableGridCell<Key>
): void {
    bindings.clearActiveDataCell();
    bindings.setState({
        selectedRowIndex: -1,
        activeRowIndex: cell.rowIndex,
        activeCell: cell,
        range: bindings.isMultiPasteKey(cell.key)
            ? {
                key: cell.key,
                anchorRow: cell.rowIndex,
                focusRow: cell.rowIndex
            }
            : null
    });
    renderSelection(bindings);
};


const extendCell = function<Key extends string>(
    bindings: VariableGridSelectionBindings<Key>,
    cell: VariableGridCell<Key>
): void {
    const state = bindings.getState();
    let range: VariableGridRange<Key> | null = null;

    if (bindings.isMultiPasteKey(cell.key)) {
        range = state.range && state.range.key === cell.key
            ? {
                ...state.range,
                focusRow: cell.rowIndex
            }
            : {
                key: cell.key,
                anchorRow: cell.rowIndex,
                focusRow: cell.rowIndex
            };
    }

    bindings.clearActiveDataCell();
    bindings.setState({
        selectedRowIndex: -1,
        activeRowIndex: cell.rowIndex,
        activeCell: cell,
        range
    });
    renderSelection(bindings);
};


export const bindVariableGridSelection = function<Key extends string>(
    bindings: VariableGridSelectionBindings<Key>
): {
    selectRow: (rowIndex: number) => void;
} {
    bindings.table.addEventListener("mousedown", (event) => {
        if (event.button !== 0) {
            return;
        }

        const cell = variableCellFromTarget<Key>(event.target);

        if (cell) {
            if (event.shiftKey) {
                event.preventDefault();
                extendCell(bindings, cell);
            } else {
                anchorCell(bindings, cell);
            }
            return;
        }

        if (!event.shiftKey) {
            const state = bindings.getState();

            bindings.setState({
                ...state,
                range: null
            });
            renderSelection(bindings);
        }
    });

    bindings.table.addEventListener("focusin", (event) => {
        const cell = variableCellFromTarget<Key>(event.target);

        if (!cell) {
            return;
        }

        const state = bindings.getState();

        bindings.setState({
            ...state,
            selectedRowIndex: -1,
            activeCell: cell
        });
        activateRow(bindings, cell.rowIndex);
    });

    bindings.table.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const target = event.target as HTMLElement | null;
        const cell = variableCellFromTarget<Key>(target);

        if (cell) {
            const rows = bindings.selectedRows(cell.key, cell.rowIndex);

            if (rows.length > 1) {
                const state = bindings.getState();

                bindings.setState({
                    ...state,
                    selectedRowIndex: -1,
                    activeRowIndex: cell.rowIndex,
                    activeCell: cell
                });
                bindings.clearActiveDataCell();
                renderSelection(bindings);
            } else {
                anchorCell(bindings, cell);
            }

            bindings.showCellMenu(
                cell,
                rows,
                event.clientX,
                event.clientY
            );
            return;
        }

        if (!target?.closest("[data-variable-row-index]")) {
            return;
        }

        const row = target.closest<HTMLElement>("tr[data-variable-row]");
        const rowIndex = Number(
            row?.getAttribute("data-variable-row") || -1
        );

        selectRow(bindings, rowIndex);
        bindings.showRowMenu(
            bindings.variableNameAt(rowIndex),
            event.clientX,
            event.clientY
        );
    }, true);

    renderSelection(bindings);

    return {
        selectRow: (rowIndex) => {
            selectRow(bindings, rowIndex);
        }
    };
};

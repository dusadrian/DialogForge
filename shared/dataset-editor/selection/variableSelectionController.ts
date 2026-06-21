import type {
    VariableGridCell,
    VariableGridRange,
    VariableGridSelectionState
} from "./variableGridSelection";


export interface VariableSelectionController<Key extends string> {
    readonly snapshot: VariableGridSelectionState<Key>;
    setState(state: VariableGridSelectionState<Key>): void;
    setSelectedRow(rowIndex: number): void;
    clear(): void;
    clearRange(): void;
    bounds(
        key: Key,
        isMultiPasteKey: (key: Key) => boolean
    ): {
        start: number;
        end: number;
    } | null;
    selectedRows(
        key: Key,
        rowIndex: number,
        isMultiPasteKey: (key: Key) => boolean
    ): number[];
    isCellSelected(
        rowIndex: number,
        key: Key,
        isMultiPasteKey: (key: Key) => boolean
    ): boolean;
    hasSelection(): boolean;
    activeCell(): VariableGridCell<Key> | null;
    range(): VariableGridRange<Key> | null;
}


export const createVariableSelectionController = function<
    Key extends string
>(): VariableSelectionController<Key> {
    let state: VariableGridSelectionState<Key> = {
        selectedRowIndex: -1,
        activeRowIndex: -1,
        activeCell: null,
        range: null
    };

    const bounds = function(
        key: Key,
        isMultiPasteKey: (key: Key) => boolean
    ): {
        start: number;
        end: number;
    } | null {
        if (
            !state.range
            || state.range.key !== key
            || !isMultiPasteKey(key)
        ) {
            return null;
        }

        const start = Math.min(
            state.range.anchorRow,
            state.range.focusRow
        );
        const end = Math.max(
            state.range.anchorRow,
            state.range.focusRow
        );

        return start === end
            ? null
            : {
                start,
                end
            };
    };

    const selectedRows = function(
        key: Key,
        rowIndex: number,
        isMultiPasteKey: (key: Key) => boolean
    ): number[] {
        const rangeBounds = bounds(key, isMultiPasteKey);

        if (
            !rangeBounds
            || rowIndex < rangeBounds.start
            || rowIndex > rangeBounds.end
        ) {
            return [rowIndex];
        }

        const rows: number[] = [];

        for (
            let index = rangeBounds.start;
            index <= rangeBounds.end;
            index += 1
        ) {
            rows.push(index);
        }

        return rows;
    };

    return {
        get snapshot(): VariableGridSelectionState<Key> {
            return state;
        },

        setState(nextState) {
            state = nextState;
        },

        setSelectedRow(rowIndex) {
            state = {
                ...state,
                selectedRowIndex: rowIndex
            };
        },

        clear() {
            state = {
                selectedRowIndex: -1,
                activeRowIndex: -1,
                activeCell: null,
                range: null
            };
        },

        clearRange() {
            state = {
                ...state,
                range: null
            };
        },

        bounds,
        selectedRows,

        isCellSelected(rowIndex, key, isMultiPasteKey) {
            const rangeBounds = bounds(key, isMultiPasteKey);

            if (rangeBounds) {
                return rowIndex >= rangeBounds.start
                    && rowIndex <= rangeBounds.end;
            }

            return state.activeCell?.rowIndex === rowIndex
                && state.activeCell.key === key;
        },

        hasSelection() {
            return state.selectedRowIndex >= 0
                || state.activeRowIndex >= 0
                || Boolean(state.activeCell)
                || Boolean(state.range);
        },

        activeCell() {
            return state.activeCell;
        },

        range() {
            return state.range;
        }
    };
};

import type {
    DataGridInteractionState
} from "../state/dataGridInteractionState";
import type {
    VariableSelectionController
} from "../selection/variableSelectionController";

export const createDatasetEditorSelectionStateController = function<Key extends string>(
    options: {
        dataGridState: DataGridInteractionState;
        variableSelection: VariableSelectionController<Key>;
        isVariableMultiPasteKey: (key: Key) => boolean;
        getActiveTab: () => string;
        hasLoadedVariables: () => boolean;
        publishDatasetState: () => void;
        renderDataPage: () => void;
        renderVariablesTable: () => void;
    }
) {
    const clearActiveDataCell = function(): void {
        options.dataGridState.clearActiveCell();
    };

    const clearJumpSelection = function(): void {
        const changed = options.dataGridState.clearJumpSelection(
            options.variableSelection.hasSelection()
        );

        if (!changed) {
            return;
        }

        options.variableSelection.clear();

        if (options.getActiveTab() === "data") {
            options.renderDataPage();
        }

        if (options.getActiveTab() === "variables" && options.hasLoadedVariables()) {
            options.renderVariablesTable();
        }
    };

    const variableCellSelectionBounds = function(
        key: Key
    ): {
        start: number;
        end: number;
    } | null {
        return options.variableSelection.bounds(
            key,
            options.isVariableMultiPasteKey
        );
    };

    const variableCellSelectionRows = function(
        key: Key,
        rowIndex: number
    ): number[] {
        return options.variableSelection.selectedRows(
            key,
            rowIndex,
            options.isVariableMultiPasteKey
        );
    };

    const isVariableCellSelected = function(
        rowIndex: number,
        key: Key
    ): boolean {
        return options.variableSelection.isCellSelected(
            rowIndex,
            key,
            options.isVariableMultiPasteKey
        );
    };

    const variableCellSelectionRowsForTarget = function(target: {
        key: Key;
        rowIndex: number;
        selectionRows?: number[];
    }): number[] {
        if (Array.isArray(target.selectionRows) && target.selectionRows.length) {
            return target.selectionRows.slice();
        }

        return variableCellSelectionRows(target.key, target.rowIndex);
    };

    const isVariableCellRangeTarget = function(target: {
        key: Key;
        rowIndex: number;
        selectionRows?: number[];
    }): boolean {
        return variableCellSelectionRowsForTarget(target).length > 1;
    };

    return {
        clearActiveDataCell,
        clearJumpSelection,
        isVariableCellRangeTarget,
        isVariableCellSelected,
        variableCellSelectionBounds,
        variableCellSelectionRows,
        variableCellSelectionRowsForTarget,
        publishDatasetEditorState: options.publishDatasetState
    };
};

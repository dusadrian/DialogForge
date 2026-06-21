import type {
    DatasetVariableMetadata
} from "../../base-app/modules/datasetViewer.types";
import type {
    DatasetVariableColumnKey
} from "../clipboard/editorClipboardState";
import {
    bindVariableGridSelection,
    type VariableGridSelectionState
} from "../selection/variableGridSelection";
import {
    bindVariableMetadataFields,
    type VariableMetadataFieldChange
} from "./variableFieldBindings";
import {
    bindVariableGridAffordances
} from "./variableGridAffordances";


type VariableKey = DatasetVariableColumnKey;


export interface VariableGridInteractionBindingsOptions {
    getSelectionState(): VariableGridSelectionState<VariableKey>;
    setSelectionState(
        state: VariableGridSelectionState<VariableKey>
    ): void;
    clearActiveDataCell(): void;
    isMultiPasteKey(key: VariableKey): boolean;
    selectedRows(key: VariableKey, rowIndex: number): number[];
    getVariables(): DatasetVariableMetadata[] | null;
    showCellMenu(
        rowIndex: number,
        key: VariableKey,
        selectionRows: number[],
        clientX: number,
        clientY: number
    ): void;
    showRowMenu(
        columnName: string,
        clientX: number,
        clientY: number
    ): void;
    isPersistedField(key: VariableKey): boolean;
    isCommandField(key: VariableKey): boolean;
    writeField(
        variable: DatasetVariableMetadata,
        key: VariableKey,
        value: string | number
    ): void;
    persistField(
        rowIndex: number,
        key: VariableKey,
        value: string | number,
        field: HTMLInputElement | HTMLSelectElement
    ): void;
    updateMeasure(
        rowIndex: number,
        value: string,
        field: HTMLSelectElement
    ): void;
    renameVariable(
        rowIndex: number,
        value: string,
        field: HTMLInputElement
    ): void;
    columnWidths: Record<VariableKey, number>;
    openValueLabels(rowIndex: number): void;
    openDataColumn(rowIndex: number): void;
    persistColumnWidths(): void;
}


export interface VariableGridInteractionBindings {
    bind(host: HTMLElement, table: HTMLElement): void;
}


const normalizeChange = function(
    change: VariableMetadataFieldChange
): {
    rowIndex: number;
    key: VariableKey;
    nextValue: string | number;
    field: HTMLInputElement | HTMLSelectElement;
} {
    return {
        rowIndex: change.rowIndex,
        key: change.key as VariableKey,
        nextValue: change.value,
        field: change.field
    };
};


export const createVariableGridInteractionBindings = function(
    options: VariableGridInteractionBindingsOptions
): VariableGridInteractionBindings {
    const bind = function(
        host: HTMLElement,
        table: HTMLElement
    ): void {
        const selection = bindVariableGridSelection<VariableKey>({
            host,
            table,
            getState: options.getSelectionState,
            setState: options.setSelectionState,
            clearActiveDataCell: options.clearActiveDataCell,
            isMultiPasteKey: options.isMultiPasteKey,
            selectedRows: options.selectedRows,
            variableNameAt: (rowIndex) => {
                const variables = options.getVariables();

                return (
                    Array.isArray(variables)
                    && rowIndex >= 0
                    && rowIndex < variables.length
                )
                    ? String(
                        variables[rowIndex]?.name || ""
                    ).trim()
                    : "";
            },
            showCellMenu: (
                cell,
                selectionRows,
                clientX,
                clientY
            ) => {
                options.showCellMenu(
                    cell.rowIndex,
                    cell.key,
                    selectionRows,
                    clientX,
                    clientY
                );
            },
            showRowMenu: options.showRowMenu
        });

        bindVariableMetadataFields({
            host,
            rowCount: options.getVariables()?.length || 0,
            input: (rawChange) => {
                const change = normalizeChange(rawChange);
                const variable =
                    options.getVariables()?.[change.rowIndex];

                if (
                    change.key === "name"
                    || options.isPersistedField(change.key)
                    || !variable
                ) {
                    return;
                }

                options.writeField(
                    variable,
                    change.key,
                    change.nextValue
                );
            },
            commit: (rawChange) => {
                const change = normalizeChange(rawChange);
                const variable =
                    options.getVariables()?.[change.rowIndex];

                if (!variable) {
                    return;
                }

                if (options.isPersistedField(change.key)) {
                    options.persistField(
                        change.rowIndex,
                        change.key,
                        change.nextValue,
                        change.field
                    );
                    return;
                }

                if (
                    change.field instanceof HTMLSelectElement
                    && options.isCommandField(change.key)
                ) {
                    options.updateMeasure(
                        change.rowIndex,
                        String(change.nextValue || ""),
                        change.field
                    );
                    return;
                }

                if (
                    change.field instanceof HTMLInputElement
                    && change.key === "name"
                ) {
                    options.renameVariable(
                        change.rowIndex,
                        String(change.nextValue || ""),
                        change.field
                    );
                    return;
                }

                options.writeField(
                    variable,
                    change.key,
                    change.nextValue
                );
            }
        });

        bindVariableGridAffordances({
            host,
            columnWidths: options.columnWidths,
            openValueLabels: options.openValueLabels,
            selectRow: selection.selectRow,
            openDataColumn: options.openDataColumn,
            persistColumnWidths: options.persistColumnWidths
        });
    };

    return {
        bind
    };
};

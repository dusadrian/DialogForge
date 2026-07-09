import type {
    ColumnInsertRequest,
    ColumnInsertResult,
    ColumnRemoveRequest,
    ColumnRemoveResult,
    ColumnRenameRequest,
    ColumnRenameResult,
    RowInsertRequest,
    RowInsertResult,
    RowNameUpdateRequest,
    RowNameUpdateResult,
    RowRemoveRequest,
    RowRemoveResult,
    RowSortRequest,
    RowSortResult,
    TabularPreviewSnapshot,
    UiCommandVisibility
} from "../../runtime/provider-contract/runtimeProvider";
import type {
    DatasetEditorSelection
} from "../state/datasetEditorState";
import {
    createColumnInsertFromSelection,
    createColumnRemoveConfirmationMessage,
    createColumnRemoveFromSelection,
    createColumnRenameFromInputs,
    createColumnRenameFromSelection,
    createRowInsertFromSelection,
    createRowNameUpdateFromInputs,
    createRowNameUpdateFromSelection,
    createRowRemoveConfirmationMessage,
    createRowRemoveFromSelection,
    createRowSortFromSelection,
    createSuggestedColumnName
} from "../commands/structuralCommands";


interface StructureControls {
    columnRenameFrom: HTMLInputElement;
    columnRenameTo: HTMLInputElement;
    columnInsertName: HTMLInputElement;
    columnInsertPosition: HTMLSelectElement;
    rowNameIndex: HTMLInputElement;
    rowNameValue: HTMLInputElement;
    rowStructurePosition: HTMLSelectElement;
}


interface MutationResult {
    status: string;
    objectName: string;
}


export interface DatasetStructureMutationBindings {
    controls: StructureControls;
    getSelection(): DatasetEditorSelection;
    getPreview(): TabularPreviewSnapshot | null;
    getUiCommandVisibility(): UiCommandVisibility;
    confirm(message: string): boolean;
    prompt(message: string, defaultValue: string): string | null;
    renderStatus(
        elementId: string,
        result: { status: string; message: string }
    ): void;
    renderColumnRename(result: ColumnRenameResult): void;
    renderColumnStructure(result: ColumnInsertResult | ColumnRemoveResult): void;
    renderRowNameUpdate(result: RowNameUpdateResult): void;
    renderRowStructure(
        result: RowInsertResult | RowRemoveResult | RowSortResult
    ): void;
    renameColumn(request: Partial<ColumnRenameRequest>): Promise<ColumnRenameResult>;
    insertColumn(request: Partial<ColumnInsertRequest>): Promise<ColumnInsertResult>;
    removeColumn(request: Partial<ColumnRemoveRequest>): Promise<ColumnRemoveResult>;
    updateRowName(request: Partial<RowNameUpdateRequest>): Promise<RowNameUpdateResult>;
    insertRow(request: Partial<RowInsertRequest>): Promise<RowInsertResult>;
    removeRow(request: Partial<RowRemoveRequest>): Promise<RowRemoveResult>;
    sortRows(request: Partial<RowSortRequest>): Promise<RowSortResult>;
    refreshDataset(objectName: string): void;
    refreshVariableMetadata(objectName: string): void;
    refreshValueLabels(objectName: string): void;
    refreshDeclaredMissing(objectName: string): void;
    refreshRuntimeEvents(): void;
}


export interface DatasetStructureMutationController {
    renameColumn(): Promise<void>;
    insertColumn(positionOverride?: string): Promise<void>;
    removeColumn(): Promise<void>;
    updateRowName(): Promise<void>;
    renameSelectedRow(): Promise<void>;
    insertRow(positionOverride?: string): Promise<void>;
    removeRow(): Promise<void>;
    sortRows(direction: string): Promise<void>;
}


export const createDatasetStructureMutationController = function(
    bindings: DatasetStructureMutationBindings
): DatasetStructureMutationController {
    const applyVisibility = function<T extends { uiCommandVisibility: string }>(
        request: T
    ): T {
        request.uiCommandVisibility = bindings.getUiCommandVisibility();
        return request;
    };

    const refreshAll = function(result: MutationResult): void {
        bindings.refreshDataset(result.objectName);
        bindings.refreshVariableMetadata(result.objectName);
        bindings.refreshValueLabels(result.objectName);
        bindings.refreshDeclaredMissing(result.objectName);
        bindings.refreshRuntimeEvents();
    };

    const refreshRows = function(result: MutationResult): void {
        bindings.refreshDataset(result.objectName);
        bindings.refreshRuntimeEvents();
    };

    const renameColumn = async function(): Promise<void> {
        const selection = bindings.getSelection();
        const controls = bindings.controls;
        const command = selection.kind === "data-column" ||
            selection.kind === "data-cell"
            ? createColumnRenameFromSelection(
                selection,
                controls.columnRenameTo.value
            )
            : createColumnRenameFromInputs(
                bindings.getPreview()?.objectName || "",
                controls.columnRenameFrom.value,
                controls.columnRenameTo.value
            );

        if (!command.request) {
            bindings.renderStatus("columnRenameStatus", command);
            return;
        }

        const result = await bindings.renameColumn(
            applyVisibility(command.request)
        );

        bindings.renderColumnRename(result);

        if (result.status === "updated") {
            refreshAll(result);
        }
    };

    const insertColumn = async function(
        positionOverride?: string
    ): Promise<void> {
        const controls = bindings.controls;
        const selection = bindings.getSelection();
        const selectedPosition = positionOverride ||
            controls.columnInsertPosition.value;
        const suggestedName = createSuggestedColumnName(
            bindings.getPreview()?.columns.map((column) => column.name) || [],
            selection.columnName,
            selectedPosition
        );
        const command = createColumnInsertFromSelection(
            selection,
            controls.columnInsertName.value || suggestedName,
            selectedPosition
        );

        if (!command.request) {
            bindings.renderStatus("columnStructureStatus", command);
            return;
        }

        if (!controls.columnInsertName.value.trim()) {
            controls.columnInsertName.value = command.request.newName;
        }

        const result = await bindings.insertColumn(
            applyVisibility(command.request)
        );

        bindings.renderColumnStructure(result);

        if (result.status === "updated") {
            refreshAll(result);
        }
    };

    const removeColumn = async function(): Promise<void> {
        const command = createColumnRemoveFromSelection(
            bindings.getSelection()
        );

        if (!command.request) {
            bindings.renderStatus("columnStructureStatus", command);
            return;
        }

        if (!bindings.confirm(
            createColumnRemoveConfirmationMessage(command.request)
        )) {
            bindings.renderStatus("columnStructureStatus", {
                status: "cancelled",
                message: "Column removal cancelled."
            });
            return;
        }

        const result = await bindings.removeColumn(
            applyVisibility(command.request)
        );

        bindings.renderColumnStructure(result);

        if (result.status === "updated") {
            refreshAll(result);
        }
    };

    const updateRowName = async function(): Promise<void> {
        const controls = bindings.controls;
        const command = createRowNameUpdateFromInputs(
            bindings.getPreview()?.objectName || "",
            Number(controls.rowNameIndex.value),
            controls.rowNameValue.value
        );

        if (!command.request) {
            bindings.renderStatus("rowNameStatus", command);
            return;
        }

        const result = await bindings.updateRowName(
            applyVisibility(command.request)
        );

        bindings.renderRowNameUpdate(result);

        if (result.status === "updated") {
            refreshRows(result);
        }
    };

    const renameSelectedRow = async function(): Promise<void> {
        const defaultName = bindings.controls.rowNameValue.value || "";
        const nextName = String(
            bindings.prompt("Rename row", defaultName) || ""
        ).trim();
        const command = createRowNameUpdateFromSelection(
            bindings.getSelection(),
            nextName
        );

        if (!command.request) {
            bindings.renderStatus("rowNameStatus", command);
            return;
        }

        const result = await bindings.updateRowName(
            applyVisibility(command.request)
        );

        bindings.renderRowNameUpdate(result);

        if (result.status === "updated") {
            refreshRows(result);
        }
    };

    const insertRow = async function(
        positionOverride?: string
    ): Promise<void> {
        const command = createRowInsertFromSelection(
            bindings.getSelection(),
            positionOverride || bindings.controls.rowStructurePosition.value
        );

        if (!command.request) {
            bindings.renderStatus("rowStructureStatus", command);
            return;
        }

        const result = await bindings.insertRow(
            applyVisibility(command.request)
        );

        bindings.renderRowStructure(result);

        if (result.status === "updated") {
            refreshRows(result);
        }
    };

    const removeRow = async function(): Promise<void> {
        const command = createRowRemoveFromSelection(bindings.getSelection());

        if (!command.request) {
            bindings.renderStatus("rowStructureStatus", command);
            return;
        }

        if (!bindings.confirm(
            createRowRemoveConfirmationMessage(command.request)
        )) {
            bindings.renderStatus("rowStructureStatus", {
                status: "cancelled",
                message: "Row deletion cancelled."
            });
            return;
        }

        const result = await bindings.removeRow(
            applyVisibility(command.request)
        );

        bindings.renderRowStructure(result);

        if (result.status === "updated") {
            refreshRows(result);
        }
    };

    const sortRows = async function(direction: string): Promise<void> {
        const command = createRowSortFromSelection(
            bindings.getSelection(),
            direction
        );

        if (!command.request) {
            bindings.renderStatus("rowStructureStatus", command);
            return;
        }

        const result = await bindings.sortRows(
            applyVisibility(command.request)
        );

        bindings.renderRowStructure(result);

        if (result.status === "updated") {
            refreshRows(result);
        }
    };

    return {
        renameColumn,
        insertColumn,
        removeColumn,
        updateRowName,
        renameSelectedRow,
        insertRow,
        removeRow,
        sortRows
    };
};

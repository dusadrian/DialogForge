import type {
    CellUpdateResult,
    ColumnInsertResult,
    ColumnRemoveResult,
    ColumnRenameResult,
    DeclaredMissingSnapshot,
    DeclaredMissingUpdateResult,
    RowInsertResult,
    RowNameUpdateResult,
    RowRemoveResult,
    RowSortResult,
    TabularPreviewSnapshot,
    UiCommandVisibility,
    ValueLabelSnapshot,
    ValueLabelUpdateResult,
    VariableMetadataSnapshot,
    VariableMetadataUpdateResult
} from "../../../runtime/provider-contract/runtimeProvider";
import type {
    ClipboardResult
} from "../../../shell-electron/clipboard/clipboardResult";
import type {
    CopyPayload
} from "../../../dataset-editor/clipboard/copyPayload";
import type {
    PastePayload
} from "../../../dataset-editor/clipboard/pastePayload";
import type {
    DatasetEditorState
} from "../../../dataset-editor/state/datasetEditorState";
import {
    createDatasetCommandController
} from "../../../dataset-editor/renderer/datasetCommandController";
import {
    createDatasetClipboardController
} from "../../../dataset-editor/renderer/datasetClipboardController";
import {
    createDatasetMetadataMutationController
} from "../../../dataset-editor/renderer/datasetMetadataMutationController";
import {
    createDatasetCellMutationController
} from "../../../dataset-editor/renderer/datasetCellMutationController";
import {
    createDatasetStructureMutationController
} from "../../../dataset-editor/renderer/datasetStructureMutationController";
import {
    createDatasetNavigationCommandController
} from "../../../dataset-editor/renderer/datasetNavigationCommandController";


interface PasteApplyResult {
    status: string;
    updates: number;
    failed?: number;
    results?: Array<
        CellUpdateResult
        | DeclaredMissingUpdateResult
        | ValueLabelUpdateResult
        | VariableMetadataUpdateResult
    >;
    message: string;
}


export interface MainDatasetCommandServicesOptions {
    window: Window;
    document: Document;
    dialogForge: DialogForgeApi;
    getState(): DatasetEditorState;
    setState(state: DatasetEditorState): void;
    getPreview(): TabularPreviewSnapshot | null;
    getMetadata(): VariableMetadataSnapshot | null;
    getCopyPayload(): CopyPayload | null;
    getPastePayload(): PastePayload | null;
    getUiCommandVisibility(): UiCommandVisibility;
    renderSelection(): void;
    renderStatus(
        elementId: string,
        result: { status: string; message: string }
    ): void;
    renderTabularPreview(snapshot: TabularPreviewSnapshot): void;
    renderVariableMetadata(snapshot: VariableMetadataSnapshot): void;
    renderVariableMetadataUpdate(result: VariableMetadataUpdateResult): void;
    renderValueLabels(snapshot: ValueLabelSnapshot): void;
    renderValueLabelUpdate(result: ValueLabelUpdateResult): void;
    renderDeclaredMissing(snapshot: DeclaredMissingSnapshot): void;
    renderDeclaredMissingUpdate(result: DeclaredMissingUpdateResult): void;
    renderCellUpdate(result: CellUpdateResult): void;
    renderColumnRename(result: ColumnRenameResult): void;
    renderColumnStructure(
        result: ColumnInsertResult | ColumnRemoveResult
    ): void;
    renderRowNameUpdate(result: RowNameUpdateResult): void;
    renderRowStructure(
        result: RowInsertResult | RowRemoveResult | RowSortResult
    ): void;
    renderCopyPayload(payload: CopyPayload): void;
    renderClipboardResult(result: ClipboardResult): void;
    renderClipboardReadResult(result: ClipboardResult): void;
    renderPastePayload(payload: PastePayload): void;
    renderPasteApplyResult(result: PasteApplyResult): void;
    refreshRuntimeEvents(): void;
    getActiveDatasetName(): string;
    openDatasetEditor(objectName: string): Promise<unknown>;
    getGoToDialogId(): string;
    executeProductGoToDialog(
        dialogId: string,
        mode: "case" | "variable"
    ): void;
    selectRow(objectName: string, rowIndex: number): void;
    selectColumn(objectName: string, columnName: string): void;
    beginEdit(): void;
    commitEdit(): void;
    cancelEdit(): void;
    toggleDatasetEditorPane(): void;
}


const inputById = function(
    document: Document,
    id: string
): HTMLInputElement {
    const element = document.getElementById(id);

    if (!(element instanceof HTMLInputElement)) {
        throw new Error("Missing dataset command input: " + id);
    }

    return element;
};


const textAreaById = function(
    document: Document,
    id: string
): HTMLTextAreaElement {
    const element = document.getElementById(id);

    if (!(element instanceof HTMLTextAreaElement)) {
        throw new Error("Missing dataset command text area: " + id);
    }

    return element;
};


const selectById = function(
    document: Document,
    id: string
): HTMLSelectElement {
    const element = document.getElementById(id);

    if (!(element instanceof HTMLSelectElement)) {
        throw new Error("Missing dataset command select: " + id);
    }

    return element;
};


export const createMainDatasetCommandServices = function(
    options: MainDatasetCommandServicesOptions
) {
    const readTabularPreview = async function(
        objectName: string
    ): Promise<void> {
        const preview = await options.dialogForge.readTabularPreview(objectName);

        options.renderTabularPreview(preview);
    };
    const metadataController = createDatasetMetadataMutationController({
        controls: {
            variableName: inputById(options.document, "variableName"),
            metadataKey: selectById(options.document, "variableMetadataKey"),
            metadataValue: inputById(options.document, "variableMetadataValue"),
            valueLabelVariable: inputById(options.document, "valueLabelVariable"),
            valueLabelValue: inputById(options.document, "valueLabelValue"),
            valueLabelLabel: inputById(options.document, "valueLabelLabel"),
            declaredMissingVariable: inputById(
                options.document,
                "declaredMissingVariable"
            ),
            declaredMissingValue: inputById(
                options.document,
                "declaredMissingValue"
            ),
            declaredMissingLabel: inputById(
                options.document,
                "declaredMissingLabel"
            )
        },
        getState: options.getState,
        setState: options.setState,
        getObjectName: function(): string {
            return options.getPreview()?.objectName || "";
        },
        getUiCommandVisibility: options.getUiCommandVisibility,
        renderSelection: options.renderSelection,
        renderStatus: options.renderStatus,
        renderVariableMetadata: options.renderVariableMetadata,
        renderVariableMetadataUpdate: options.renderVariableMetadataUpdate,
        renderValueLabels: options.renderValueLabels,
        renderValueLabelUpdate: options.renderValueLabelUpdate,
        renderDeclaredMissing: options.renderDeclaredMissing,
        renderDeclaredMissingUpdate: options.renderDeclaredMissingUpdate,
        writeVariableMetadata: options.dialogForge.writeVariableMetadata,
        writeValueLabels: options.dialogForge.writeValueLabels,
        writeDeclaredMissing: options.dialogForge.writeDeclaredMissing,
        readVariableMetadata: options.dialogForge.readVariableMetadata,
        readValueLabels: options.dialogForge.readValueLabels,
        readDeclaredMissing: options.dialogForge.readDeclaredMissing,
        refreshRuntimeEvents: options.refreshRuntimeEvents
    });
    const cellController = createDatasetCellMutationController({
        controls: {
            row: inputById(options.document, "cellRow"),
            column: inputById(options.document, "cellColumn"),
            value: inputById(options.document, "cellValue")
        },
        getState: options.getState,
        setState: options.setState,
        getObjectName: function(): string {
            return options.getPreview()?.objectName || "";
        },
        getUiCommandVisibility: options.getUiCommandVisibility,
        renderSelection: options.renderSelection,
        renderStatus: options.renderStatus,
        renderResult: options.renderCellUpdate,
        writeCell: options.dialogForge.writeCell,
        refreshDataset: function(objectName): void {
            void readTabularPreview(objectName);
        },
        refreshVariableMetadata: function(objectName): void {
            void metadataController.readVariableMetadata(objectName);
        },
        refreshValueLabels: function(objectName): void {
            void metadataController.readValueLabels(objectName);
        },
        refreshDeclaredMissing: function(objectName): void {
            void metadataController.readDeclaredMissing(objectName);
        },
        refreshRuntimeEvents: options.refreshRuntimeEvents
    });
    const structureController = createDatasetStructureMutationController({
        controls: {
            columnRenameFrom: inputById(options.document, "columnRenameFrom"),
            columnRenameTo: inputById(options.document, "columnRenameTo"),
            columnInsertName: inputById(options.document, "columnInsertName"),
            columnInsertPosition: selectById(
                options.document,
                "columnInsertPosition"
            ),
            rowNameIndex: inputById(options.document, "rowNameIndex"),
            rowNameValue: inputById(options.document, "rowNameValue"),
            rowStructurePosition: selectById(
                options.document,
                "rowStructurePosition"
            )
        },
        getSelection: function() {
            return options.getState().selection;
        },
        getPreview: options.getPreview,
        getUiCommandVisibility: options.getUiCommandVisibility,
        confirm: options.window.confirm.bind(options.window),
        prompt: options.window.prompt.bind(options.window),
        renderStatus: options.renderStatus,
        renderColumnRename: options.renderColumnRename,
        renderColumnStructure: options.renderColumnStructure,
        renderRowNameUpdate: options.renderRowNameUpdate,
        renderRowStructure: options.renderRowStructure,
        renameColumn: options.dialogForge.renameColumn,
        insertColumn: options.dialogForge.insertColumn,
        removeColumn: options.dialogForge.removeColumn,
        updateRowName: options.dialogForge.updateRowName,
        insertRow: options.dialogForge.insertRow,
        removeRow: options.dialogForge.removeRow,
        sortRows: options.dialogForge.sortRows,
        refreshDataset: function(objectName): void {
            void readTabularPreview(objectName);
        },
        refreshVariableMetadata: function(objectName): void {
            void metadataController.readVariableMetadata(objectName);
        },
        refreshValueLabels: function(objectName): void {
            void metadataController.readValueLabels(objectName);
        },
        refreshDeclaredMissing: function(objectName): void {
            void metadataController.readDeclaredMissing(objectName);
        },
        refreshRuntimeEvents: options.refreshRuntimeEvents
    });
    const clipboardController = createDatasetClipboardController({
        pasteInput: textAreaById(options.document, "pasteInput"),
        getPreview: options.getPreview,
        getMetadata: options.getMetadata,
        getSelection: function() {
            return options.getState().selection;
        },
        getCopyPayload: options.getCopyPayload,
        getPastePayload: options.getPastePayload,
        renderCopyPayload: options.renderCopyPayload,
        renderClipboardResult: options.renderClipboardResult,
        renderClipboardReadResult: options.renderClipboardReadResult,
        renderPastePayload: options.renderPastePayload,
        renderPasteApplyResult: options.renderPasteApplyResult,
        refreshDataset: function(objectName): void {
            void readTabularPreview(objectName);
        },
        refreshVariableMetadata: function(objectName): void {
            void metadataController.readVariableMetadata(objectName);
        },
        refreshValueLabels: function(objectName): void {
            void metadataController.readValueLabels(objectName);
        },
        refreshDeclaredMissing: function(objectName): void {
            void metadataController.readDeclaredMissing(objectName);
        },
        refreshRuntimeEvents: options.refreshRuntimeEvents
    });
    const navigationController = createDatasetNavigationCommandController({
        getPreview: options.getPreview,
        prompt: options.window.prompt.bind(options.window),
        getGoToDialogId: options.getGoToDialogId,
        executeProductGoToDialog: options.executeProductGoToDialog,
        selectRow: options.selectRow,
        selectColumn: options.selectColumn
    });
    const openActiveDataset = function(): void {
        const objectName = String(options.getActiveDatasetName() || "").trim();

        if (!objectName) {
            options.renderStatus("datasetLayoutStatus", {
                status: "unavailable",
                message: "No active dataset is selected."
            });
            return;
        }

        void options.openDatasetEditor(objectName);
    };
    const executeDatasetCommand = createDatasetCommandController({
        goToCase: navigationController.goToCase,
        goToVariable: navigationController.goToVariable,
        openActive: openActiveDataset,
        buildCopyPayload: clipboardController.buildCopyPayload,
        copyToClipboard: clipboardController.copyToClipboard,
        readClipboard: function(): void {
            void clipboardController.readClipboard();
        },
        parsePaste: clipboardController.parsePasteInput,
        applyPaste: function(): void {
            void clipboardController.applyPaste();
        },
        beginEdit: options.beginEdit,
        commitEdit: options.commitEdit,
        cancelEdit: options.cancelEdit,
        writeCell: function(): void {
            void cellController.write();
        },
        pasteFromClipboard: function(): void {
            void clipboardController.pasteFromClipboard();
        },
        toggleTab: options.toggleDatasetEditorPane,
        insertColumn: function(position): void {
            void structureController.insertColumn(position);
        },
        removeColumn: function(): void {
            void structureController.removeColumn();
        },
        renameColumn: function(): void {
            void structureController.renameColumn();
        },
        insertRow: function(position): void {
            void structureController.insertRow(position);
        },
        removeRow: function(): void {
            void structureController.removeRow();
        },
        renameRow: function(): void {
            void structureController.renameSelectedRow();
        },
        sortRows: function(direction): void {
            void structureController.sortRows(direction);
        },
        updateVariableMetadata: function(): void {
            void metadataController.writeVariableMetadata();
        },
        updateValueLabels: function(): void {
            void metadataController.writeValueLabels();
        },
        updateDeclaredMissing: function(): void {
            void metadataController.writeDeclaredMissing();
        }
    });

    return {
        readTabularPreview,
        readVariableMetadata: metadataController.readVariableMetadata,
        writeVariableMetadata: metadataController.writeVariableMetadata,
        readValueLabels: metadataController.readValueLabels,
        writeValueLabels: metadataController.writeValueLabels,
        readDeclaredMissing: metadataController.readDeclaredMissing,
        writeDeclaredMissing: metadataController.writeDeclaredMissing,
        writeCell: cellController.write,
        updateRowName: function(): void {
            void structureController.renameSelectedRow();
        },
        executeDatasetCommand
    };
};

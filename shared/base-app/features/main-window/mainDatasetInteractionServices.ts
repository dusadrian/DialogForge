import type {
    TabularPreviewSnapshot,
    VariableMetadataFieldKey,
    VariableMetadataSnapshot
} from "../../../runtime/provider-contract/runtimeProvider";
import type {
    DatasetEditorState
} from "../../../dataset-editor/state/datasetEditorState";
import {
    contextMenuActionsApi
} from "../../../dataset-editor/context-menus/contextMenuActions";
import {
    createDatasetLayoutController
} from "../../../dataset-editor/renderer/datasetLayoutController";
import {
    createDatasetReadPanelController
} from "../../../dataset-editor/renderer/datasetReadPanelController";
import {
    createDatasetSelectionController
} from "../../../dataset-editor/renderer/datasetSelectionController";
import {
    createDatasetGoToController
} from "../../../dataset-editor/renderer/datasetGoToController";
import {
    createDatasetEditController
} from "../../../dataset-editor/renderer/datasetEditController";
import {
    datasetSelectionPanelApi
} from "../dataset-editor/datasetSelectionPanel";


export interface MainDatasetInteractionServicesOptions {
    window: Window;
    document: Document;
    contextMenu: HTMLElement;
    variableMetadataFields: VariableMetadataFieldKey[];
    getState(): DatasetEditorState;
    setState(state: DatasetEditorState): void;
    getPreview(): TabularPreviewSnapshot | null;
    setPreview(preview: TabularPreviewSnapshot): void;
    getMetadata(): VariableMetadataSnapshot | null;
    setMetadata(snapshot: VariableMetadataSnapshot): void;
    getActiveDatasetName(): string;
    clearCopyPayload(): void;
    applyControlUpdates(updates: Array<{ id: string; value: string }>): void;
    appendCommandField(
        parent: HTMLElement,
        name: string,
        value: unknown
    ): void;
    empty(element: HTMLElement): void;
    renderLayoutStatus(result: { status: string; message: string }): void;
    renderEditStatus(result: { status: string; message: string }): void;
    executeCommand(command: string): void;
    writeCell(): void;
    writeVariableMetadata(): void;
}


export const createMainDatasetInteractionServices = function(
    options: MainDatasetInteractionServicesOptions
) {
    const layoutController = createDatasetLayoutController({
        getState: options.getState,
        setState: options.setState,
        getPreview: options.getPreview,
        getMetadata: options.getMetadata,
        getObjectName: function(): string {
            return goToController.getDatasetName();
        },
        renderPreview: function(preview): void {
            readPanelController.renderTabularPreview(preview);
        },
        renderMetadata: function(metadata): void {
            readPanelController.renderVariableMetadata(metadata);
        },
        renderStatus: options.renderLayoutStatus
    });
    const readPanelController = createDatasetReadPanelController({
        document: options.document,
        helpers: {
            appendField: options.appendCommandField,
            empty: options.empty
        },
        variableMetadataFields: options.variableMetadataFields,
        getState: options.getState,
        setTabularPreview: options.setPreview,
        setVariableMetadata: options.setMetadata,
        syncColumnOrder: layoutController.syncColumnOrder,
        renderLayoutControls: layoutController.renderControls,
        selectCell: function(objectName, rowIndex, columnName, value): void {
            selectionController.selectCell(
                objectName,
                rowIndex,
                columnName,
                value
            );
        },
        selectRow: function(objectName, rowIndex): void {
            selectionController.selectRow(objectName, rowIndex);
        },
        selectColumn: function(objectName, columnName): void {
            selectionController.selectColumn(objectName, columnName);
        },
        resizeColumn: layoutController.resizeColumn,
        moveColumn: layoutController.moveColumn,
        selectVariableCell: function(
            objectName,
            rowIndex,
            metadataKey,
            variableName,
            value
        ): void {
            selectionController.selectVariableCell(
                objectName,
                rowIndex,
                metadataKey,
                variableName,
                value
            );
        },
        selectVariableRange: function(
            objectName,
            rowIndex,
            metadataKey,
            variableName,
            value
        ): void {
            selectionController.selectVariableRange(
                objectName,
                rowIndex,
                metadataKey,
                variableName,
                value
            );
        },
        selectVariableRow: function(
            objectName,
            rowIndex,
            variableName
        ): void {
            selectionController.selectVariableRow(
                objectName,
                rowIndex,
                variableName
            );
        },
        beginEdit: function(): void {
            editController.begin();
        },
        openContextMenu: function(x, y): void {
            selectionController.showContextMenu(x, y);
        },
        executeCommand: options.executeCommand
    });
    const selectionController = createDatasetSelectionController({
        getState: options.getState,
        setState: options.setState,
        clearCopyPayload: options.clearCopyPayload,
        applyControlUpdates: options.applyControlUpdates,
        renderSelection: readPanelController.renderSelection,
        hideContextMenu: readPanelController.hideContextMenu,
        showContextMenu: function(clientX, clientY, executeCommand): void {
            datasetSelectionPanelApi.showContextMenu(
                options.window,
                options.contextMenu,
                contextMenuActionsApi.getDatasetEditorContextActions(
                    options.getState().selection
                ),
                clientX,
                clientY,
                executeCommand,
                {
                    appendField: options.appendCommandField,
                    empty: options.empty
                }
            );
        },
        executeCommand: options.executeCommand
    });
    const goToController = createDatasetGoToController({
        getDatasetName: function(): string {
            return options.getPreview()?.objectName
                || options.getActiveDatasetName();
        },
        getSelection: function() {
            return options.getState().selection;
        },
        selectRow: selectionController.selectRow,
        selectColumn: selectionController.selectColumn
    });
    const editController = createDatasetEditController({
        getState: options.getState,
        setState: options.setState,
        renderSelection: readPanelController.renderSelection,
        renderStatus: options.renderEditStatus,
        writeCell: options.writeCell,
        writeVariableMetadata: options.writeVariableMetadata
    });

    return {
        applyDatasetViewport: layoutController.applyDataViewport,
        shiftDatasetViewport: layoutController.shiftDataViewport,
        applyVariableViewport: layoutController.applyVariableViewport,
        shiftVariableViewport: layoutController.shiftVariableViewport,
        applySelectedColumnWidth: layoutController.applyColumnWidth,
        resizeSelectedColumn: layoutController.resizeColumn,
        moveSelectedColumn: layoutController.moveColumn,
        renderTabularPreview: readPanelController.renderTabularPreview,
        renderDatasetEditorSelection: readPanelController.renderSelection,
        hideDatasetEditorContextMenu: readPanelController.hideContextMenu,
        renderVariableMetadata: readPanelController.renderVariableMetadata,
        renderValueLabels: readPanelController.renderValueLabels,
        renderDeclaredMissing: readPanelController.renderDeclaredMissing,
        toggleDatasetEditorPane: selectionController.togglePane,
        showDatasetEditorContextMenu: selectionController.showContextMenu,
        selectPreviewRow: selectionController.selectRow,
        selectPreviewColumn: selectionController.selectColumn,
        getCurrentDatasetEditorObjectName: goToController.getDatasetName,
        createDatasetEditorStateSnapshot: goToController.getStateSnapshot,
        consumeGoToDialogContext: goToController.consume,
        prepareGoToDialogContext: goToController.prepare,
        gotoDatasetEditorCase: goToController.goToCase,
        gotoDatasetEditorVariable: goToController.goToVariable,
        beginDatasetEdit: editController.begin,
        cancelDatasetEdit: editController.cancel,
        commitDatasetEdit: editController.commit
    };
};

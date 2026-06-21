import type {
    DeclaredMissingSnapshot,
    TabularPreviewSnapshot,
    ValueLabelSnapshot,
    VariableMetadataFieldKey,
    VariableMetadataSnapshot
} from "../../runtime/provider-contract/runtimeProvider";
import type {
    DatasetEditorState
} from "../state/datasetEditorState";
import {
    contextMenuActionsApi
} from "../context-menus/contextMenuActions";
import {
    datasetTablesApi
} from "../../base-app/features/dataset-editor/datasetTables";
import {
    datasetSelectionPanelApi
} from "../../base-app/features/dataset-editor/datasetSelectionPanel";


interface PanelHelpers {
    appendField(parent: HTMLElement, name: string, value: unknown): void;
    empty(element: HTMLElement): void;
}


export interface DatasetReadPanelBindings {
    document: Document;
    helpers: PanelHelpers;
    variableMetadataFields: VariableMetadataFieldKey[];
    getState(): DatasetEditorState;
    setTabularPreview(preview: TabularPreviewSnapshot): void;
    setVariableMetadata(snapshot: VariableMetadataSnapshot): void;
    syncColumnOrder(preview: TabularPreviewSnapshot): void;
    renderLayoutControls(): void;
    selectCell(
        objectName: string,
        rowIndex: number,
        columnName: string,
        value: string
    ): void;
    selectRow(objectName: string, rowIndex: number): void;
    selectColumn(objectName: string, columnName: string): void;
    resizeColumn(delta: number): void;
    moveColumn(delta: number): void;
    selectVariableCell(
        objectName: string,
        rowIndex: number,
        metadataKey: VariableMetadataFieldKey,
        variableName: string,
        value: string
    ): void;
    selectVariableRange(
        objectName: string,
        rowIndex: number,
        metadataKey: VariableMetadataFieldKey,
        variableName: string,
        value: string
    ): void;
    selectVariableRow(
        objectName: string,
        rowIndex: number,
        variableName: string
    ): void;
    beginEdit(): void;
    openContextMenu(x: number, y: number): void;
    executeCommand(command: string): void;
}


export const createDatasetReadPanelController = function(
    bindings: DatasetReadPanelBindings
) {
    const byId = function(id: string): HTMLElement {
        const element = bindings.document.getElementById(id);

        if (!element) {
            throw new Error("Missing dataset panel element: " + id);
        }

        return element;
    };

    const refreshSelectionHighlights = function(): void {
        datasetSelectionPanelApi.refreshDatasetSelectionHighlights(
            bindings.document,
            bindings.getState().selection
        );
    };

    const renderSelection = function(): void {
        const state = bindings.getState();

        datasetSelectionPanelApi.renderDatasetEditorSelection(
            bindings.document,
            byId("datasetEditorSelection"),
            byId("datasetEditorContextActions"),
            state,
            contextMenuActionsApi.getDatasetEditorContextActions(
                state.selection
            ),
            bindings.executeCommand,
            bindings.helpers
        );
        refreshSelectionHighlights();
    };

    const hideContextMenu = function(): void {
        datasetSelectionPanelApi.hideContextMenu(
            byId("datasetEditorContextMenu"),
            bindings.helpers
        );
    };

    const renderTabularPreview = function(
        preview: TabularPreviewSnapshot
    ): void {
        const status = byId("tabularPreviewStatus");
        const host = byId("tabularPreviewTable");

        bindings.setTabularPreview(preview);
        bindings.helpers.empty(status);
        bindings.helpers.empty(host);
        bindings.helpers.appendField(status, "status", preview.status);
        bindings.helpers.appendField(status, "object", preview.objectName);
        bindings.helpers.appendField(status, "message", preview.message);

        if (preview.status !== "ready") {
            return;
        }

        bindings.syncColumnOrder(preview);
        bindings.renderLayoutControls();

        const table = datasetTablesApi.createDataPreviewTable(
            bindings.document,
            preview,
            {
                selectCell: bindings.selectCell,
                selectRow: bindings.selectRow,
                selectColumn: bindings.selectColumn,
                resizeColumn: function(
                    _objectName,
                    columnName,
                    delta
                ): void {
                    bindings.selectColumn(preview.objectName, columnName);
                    bindings.resizeColumn(delta);
                },
                moveColumn: function(
                    _objectName,
                    columnName,
                    delta
                ): void {
                    bindings.selectColumn(preview.objectName, columnName);
                    bindings.moveColumn(delta);
                },
                beginEdit: bindings.beginEdit,
                openContextMenu: bindings.openContextMenu
            },
            { state: bindings.getState() }
        );

        if (table) {
            host.appendChild(table);
        }
        refreshSelectionHighlights();
    };

    const renderVariableMetadata = function(
        snapshot: VariableMetadataSnapshot
    ): void {
        const status = byId("variableMetadataStatus");
        const host = byId("variableMetadataTable");

        bindings.setVariableMetadata(snapshot);
        bindings.helpers.empty(status);
        bindings.helpers.empty(host);
        bindings.helpers.appendField(status, "status", snapshot.status);
        bindings.helpers.appendField(status, "object", snapshot.objectName);
        bindings.helpers.appendField(status, "message", snapshot.message);

        if (snapshot.status !== "ready") {
            return;
        }

        bindings.renderLayoutControls();
        const state = bindings.getState();
        const table = datasetTablesApi.createVariableMetadataTable(
            bindings.document,
            snapshot,
            bindings.variableMetadataFields,
            {
                containsCell: function(rowIndex, metadataKey): boolean {
                    return contextMenuActionsApi
                        .selectionContainsVariableMetadataCell(
                            state.selection,
                            rowIndex,
                            metadataKey
                        );
                },
                selectCell: bindings.selectVariableCell,
                selectRange: bindings.selectVariableRange,
                selectRow: bindings.selectVariableRow,
                beginEdit: bindings.beginEdit,
                openContextMenu: bindings.openContextMenu
            },
            { state }
        );

        if (table) {
            host.appendChild(table);
        }
        refreshSelectionHighlights();
    };

    const renderSimpleTable = function(
        statusId: string,
        hostId: string,
        snapshot: ValueLabelSnapshot | DeclaredMissingSnapshot,
        table: HTMLTableElement | null
    ): void {
        const status = byId(statusId);
        const host = byId(hostId);

        bindings.helpers.empty(status);
        bindings.helpers.empty(host);
        bindings.helpers.appendField(status, "status", snapshot.status);
        bindings.helpers.appendField(status, "object", snapshot.objectName);
        bindings.helpers.appendField(status, "message", snapshot.message);

        if (snapshot.status === "ready" && table) {
            host.appendChild(table);
        }
    };

    return {
        renderTabularPreview,
        renderSelection,
        refreshSelectionHighlights,
        hideContextMenu,
        renderVariableMetadata,
        renderValueLabels: function(snapshot: ValueLabelSnapshot): void {
            renderSimpleTable(
                "valueLabelsStatus",
                "valueLabelsTable",
                snapshot,
                datasetTablesApi.createValueLabelsTable(
                    bindings.document,
                    snapshot
                )
            );
        },
        renderDeclaredMissing: function(
            snapshot: DeclaredMissingSnapshot
        ): void {
            renderSimpleTable(
                "declaredMissingStatus",
                "declaredMissingTable",
                snapshot,
                datasetTablesApi.createDeclaredMissingTable(
                    bindings.document,
                    snapshot
                )
            );
        }
    };
};

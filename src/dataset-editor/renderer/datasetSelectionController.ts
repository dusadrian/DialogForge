import type {
    VariableMetadataFieldKey
} from "../../runtime/provider-contract/runtimeProvider";
import type {
    DatasetEditorState
} from "../state/datasetEditorState";
import {
    datasetEditorReducer
} from "../state/datasetEditorState";
import {
    createDataCellSelectionPlan,
    createDataColumnSelectionPlan,
    createDataRowSelectionPlan,
    createMetadataRangeSelectionPlan,
    createVariableCellSelectionPlan,
    createVariableRowSelectionPlan
} from "../selection/selectionControls";


export interface DatasetSelectionControllerBindings {
    getState(): DatasetEditorState;
    setState(state: DatasetEditorState): void;
    clearCopyPayload(): void;
    applyControlUpdates(updates: Array<{ id: string; value: string }>): void;
    renderSelection(): void;
    hideContextMenu(): void;
    showContextMenu(
        clientX: number,
        clientY: number,
        executeCommand: (command: string) => void
    ): void;
    executeCommand(command: string): void;
}


export interface DatasetSelectionController {
    hideContextMenu(): void;
    showContextMenu(clientX: number, clientY: number): void;
    togglePane(): void;
    selectCell(
        objectName: string,
        rowIndex: number,
        columnName: string,
        value: string | null
    ): void;
    selectRow(objectName: string, rowIndex: number): void;
    selectColumn(objectName: string, columnName: string): void;
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
}


export const createDatasetSelectionController = function(
    bindings: DatasetSelectionControllerBindings
): DatasetSelectionController {
    let focusedPane: "data" | "variables" = "data";

    const applyPlan = function(plan: {
        action: Parameters<typeof datasetEditorReducer>[1];
        controls: Array<{ id: string; value: string }>;
    }): void {
        bindings.clearCopyPayload();
        bindings.setState(datasetEditorReducer(bindings.getState(), plan.action));
        bindings.applyControlUpdates(plan.controls);
        bindings.renderSelection();
    };

    const activePane = function(): "data" | "variables" {
        const activeElement = document.activeElement;

        if (activeElement instanceof HTMLElement) {
            if (activeElement.closest("#variableMetadataPanel")) {
                return "variables";
            }
            if (activeElement.closest("#datasetPreviewPanel")) {
                return "data";
            }
        }

        return focusedPane;
    };

    const focusPane = function(pane: "data" | "variables"): void {
        const panelId = pane === "variables"
            ? "variableMetadataPanel"
            : "datasetPreviewPanel";
        const panel = document.getElementById(panelId);

        if (!(panel instanceof HTMLElement)) {
            throw new Error("Missing dataset editor panel: " + panelId);
        }

        focusedPane = pane;
        panel.setAttribute("tabindex", "-1");
        panel.scrollIntoView({ block: "start" });
        panel.focus({ preventScroll: true });
    };

    return {
        hideContextMenu: bindings.hideContextMenu,
        showContextMenu: function(clientX, clientY): void {
            bindings.showContextMenu(
                clientX,
                clientY,
                bindings.executeCommand
            );
        },
        togglePane: function(): void {
            focusPane(activePane() === "variables" ? "data" : "variables");
        },
        selectCell: function(objectName, rowIndex, columnName, value): void {
            applyPlan(createDataCellSelectionPlan(
                objectName,
                rowIndex,
                columnName,
                value
            ));
        },
        selectRow: function(objectName, rowIndex): void {
            applyPlan(createDataRowSelectionPlan(objectName, rowIndex));
        },
        selectColumn: function(objectName, columnName): void {
            applyPlan(createDataColumnSelectionPlan(objectName, columnName));
        },
        selectVariableCell: function(
            objectName,
            rowIndex,
            metadataKey,
            variableName,
            value
        ): void {
            applyPlan(createVariableCellSelectionPlan(
                objectName,
                rowIndex,
                metadataKey,
                variableName,
                value
            ));
        },
        selectVariableRange: function(
            objectName,
            rowIndex,
            metadataKey,
            variableName,
            value
        ): void {
            applyPlan(createMetadataRangeSelectionPlan(
                bindings.getState().selection,
                objectName,
                rowIndex,
                metadataKey,
                variableName,
                value
            ));
        },
        selectVariableRow: function(objectName, rowIndex, variableName): void {
            applyPlan(createVariableRowSelectionPlan(
                objectName,
                rowIndex,
                variableName
            ));
        }
    };
};

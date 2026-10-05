import type {
    CellUpdateRequest,
    CellUpdateResult,
    RuntimeSessionSnapshot,
    UiCommandVisibility
} from "../../runtime/provider-contract/runtimeProvider";
import type {
    DatasetEditorState
} from "../state/datasetEditorState";
import {
    datasetEditorReducer
} from "../state/datasetEditorState";
import {
    createCellEditFromInputs,
    createEditCommitFromSelection
} from "../commands/editCommands";
import { captureDatasetConsumerScope } from "./datasetConsumerScope";


interface CellControls {
    row: HTMLInputElement;
    column: HTMLInputElement;
    value: HTMLInputElement;
}


export interface DatasetCellMutationBindings {
    controls: CellControls;
    getState(): DatasetEditorState;
    setState(state: DatasetEditorState): void;
    getObjectName(): string;
    getUiCommandVisibility(): UiCommandVisibility;
    getRuntimeSnapshot(): RuntimeSessionSnapshot | null;
    renderSelection(): void;
    renderStatus(
        elementId: string,
        result: { status: string; message: string }
    ): void;
    renderResult(result: CellUpdateResult): void;
    writeCell(request: Partial<CellUpdateRequest>): Promise<CellUpdateResult>;
    refreshDataset(objectName: string): void;
    refreshVariableMetadata(objectName: string): void;
    refreshValueLabels(objectName: string): void;
    refreshDeclaredMissing(objectName: string): void;
    refreshRuntimeEvents(): void;
}


export const createDatasetCellMutationController = function(
    bindings: DatasetCellMutationBindings
): { write(): Promise<void> } {
    const write = async function(): Promise<void> {
        const state = bindings.getState();
        const controls = bindings.controls;
        const command = state.selection.kind === "data-cell"
            ? createEditCommitFromSelection(
                state.selection,
                "",
                controls.value.value
            )
            : createCellEditFromInputs(
                bindings.getObjectName(),
                Number(controls.row.value),
                controls.column.value,
                controls.value.value
            );

        if (!command.cellRequest) {
            bindings.renderStatus("cellWriteStatus", command);
            return;
        }

        command.cellRequest.uiCommandVisibility =
            bindings.getUiCommandVisibility();
        const isCurrent = captureDatasetConsumerScope(bindings);

        if (!isCurrent()) {
            return;
        }
        const result = await bindings.writeCell(command.cellRequest);

        if (!isCurrent()) {
            return;
        }
        bindings.renderResult(result);

        if (isCurrent() && result.status === "updated") {
            bindings.setState(datasetEditorReducer(bindings.getState(), {
                type: "endEdit"
            }));
            if (!isCurrent()) {
                return;
            }
            bindings.renderSelection();
            if (!isCurrent()) {
                return;
            }
            bindings.refreshDataset(result.objectName);
            if (!isCurrent()) {
                return;
            }
            bindings.refreshVariableMetadata(result.objectName);
            if (!isCurrent()) {
                return;
            }
            bindings.refreshValueLabels(result.objectName);
            if (!isCurrent()) {
                return;
            }
            bindings.refreshDeclaredMissing(result.objectName);
            if (!isCurrent()) {
                return;
            }
            bindings.refreshRuntimeEvents();
        }
    };

    return { write };
};

import type {
    DeclaredMissingSnapshot,
    DeclaredMissingUpdateRequest,
    DeclaredMissingUpdateResult,
    RuntimeSessionSnapshot,
    UiCommandVisibility,
    ValueLabelSnapshot,
    ValueLabelUpdateRequest,
    ValueLabelUpdateResult,
    VariableMetadataFieldKey,
    VariableMetadataSnapshot,
    VariableMetadataUpdateRequest,
    VariableMetadataUpdateResult
} from "../../runtime/provider-contract/runtimeProvider";
import type {
    DatasetEditorState
} from "../state/datasetEditorState";
import {
    datasetEditorReducer
} from "../state/datasetEditorState";
import {
    createEditCommitFromSelection
} from "../commands/editCommands";
import {
    createDeclaredMissingUpdateFromInputs,
    createDeclaredMissingUpdateFromSelection,
    createValueLabelUpdateFromInputs,
    createValueLabelUpdateFromSelection,
    createVariableMetadataUpdateFromInputs
} from "../commands/metadataCommands";
import { captureDatasetConsumerScope } from "./datasetConsumerScope";


interface MetadataControls {
    variableName: HTMLInputElement;
    metadataKey: HTMLSelectElement;
    metadataValue: HTMLInputElement;
    valueLabelVariable: HTMLInputElement;
    valueLabelValue: HTMLInputElement;
    valueLabelLabel: HTMLInputElement;
    declaredMissingVariable: HTMLInputElement;
    declaredMissingValue: HTMLInputElement;
    declaredMissingLabel: HTMLInputElement;
}


interface CommandStatus {
    status: string;
    message: string;
}


export interface DatasetMetadataMutationBindings {
    controls: MetadataControls;
    getState(): DatasetEditorState;
    setState(state: DatasetEditorState): void;
    getObjectName(): string;
    getRuntimeSnapshot(): RuntimeSessionSnapshot | null;
    getUiCommandVisibility(): UiCommandVisibility;
    renderSelection(): void;
    renderStatus(elementId: string, result: CommandStatus): void;
    renderVariableMetadata(snapshot: VariableMetadataSnapshot): void;
    renderVariableMetadataUpdate(result: VariableMetadataUpdateResult): void;
    renderValueLabels(snapshot: ValueLabelSnapshot): void;
    renderValueLabelUpdate(result: ValueLabelUpdateResult): void;
    renderDeclaredMissing(snapshot: DeclaredMissingSnapshot): void;
    renderDeclaredMissingUpdate(result: DeclaredMissingUpdateResult): void;
    writeVariableMetadata(
        request: Partial<VariableMetadataUpdateRequest>
    ): Promise<VariableMetadataUpdateResult>;
    writeValueLabels(
        request: Partial<ValueLabelUpdateRequest>
    ): Promise<ValueLabelUpdateResult>;
    writeDeclaredMissing(
        request: Partial<DeclaredMissingUpdateRequest>
    ): Promise<DeclaredMissingUpdateResult>;
    readVariableMetadata(objectName: string): Promise<VariableMetadataSnapshot>;
    readValueLabels(objectName: string): Promise<ValueLabelSnapshot>;
    readDeclaredMissing(objectName: string): Promise<DeclaredMissingSnapshot>;
    refreshRuntimeEvents(): void;
}


export interface DatasetMetadataMutationController {
    readVariableMetadata(objectName: string): Promise<void>;
    writeVariableMetadata(): Promise<void>;
    readValueLabels(objectName: string): Promise<void>;
    writeValueLabels(): Promise<void>;
    readDeclaredMissing(objectName: string): Promise<void>;
    writeDeclaredMissing(): Promise<void>;
}


export const createDatasetMetadataMutationController = function(
    bindings: DatasetMetadataMutationBindings
): DatasetMetadataMutationController {
    const readVariableMetadata = async function(
        objectName: string
    ): Promise<void> {
        const isCurrent = captureDatasetConsumerScope(bindings);
        if (!isCurrent()) {
            return;
        }
        const snapshot = await bindings.readVariableMetadata(objectName || "");

        if (isCurrent()) {
            bindings.renderVariableMetadata(snapshot);
        }
    };

    const writeVariableMetadata = async function(): Promise<void> {
        const state = bindings.getState();
        const controls = bindings.controls;
        const command = state.selection.kind === "variable-cell"
            ? createEditCommitFromSelection(
                state.selection,
                controls.variableName.value,
                controls.metadataValue.value
            )
            : createVariableMetadataUpdateFromInputs(
                bindings.getObjectName(),
                controls.variableName.value,
                controls.metadataKey.value as VariableMetadataFieldKey,
                controls.metadataValue.value
            );
        const request = "metadataRequest" in command
            ? command.metadataRequest
            : command.request;

        if (request === null) {
            bindings.renderStatus("variableMetadataWriteStatus", command);
            return;
        }

        request.uiCommandVisibility = bindings.getUiCommandVisibility();
        const isCurrent = captureDatasetConsumerScope(bindings);
        if (!isCurrent()) {
            return;
        }
        const result = await bindings.writeVariableMetadata(request);

        if (!isCurrent()) {
            return;
        }
        bindings.renderVariableMetadataUpdate(result);

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
            void readVariableMetadata(result.objectName);
            if (isCurrent()) {
                bindings.refreshRuntimeEvents();
            }
        }
    };

    const readValueLabels = async function(
        objectName: string
    ): Promise<void> {
        const isCurrent = captureDatasetConsumerScope(bindings);
        if (!isCurrent()) {
            return;
        }
        const snapshot = await bindings.readValueLabels(objectName || "");

        if (isCurrent()) {
            bindings.renderValueLabels(snapshot);
        }
    };

    const writeValueLabels = async function(): Promise<void> {
        const controls = bindings.controls;
        const selection = bindings.getState().selection;
        const command = selection.kind === "variable-cell"
            ? createValueLabelUpdateFromSelection(
                selection,
                controls.valueLabelVariable.value,
                controls.valueLabelValue.value,
                controls.valueLabelLabel.value
            )
            : createValueLabelUpdateFromInputs(
                bindings.getObjectName(),
                controls.valueLabelVariable.value,
                controls.valueLabelValue.value,
                controls.valueLabelLabel.value
            );

        if (!command.request) {
            bindings.renderStatus("valueLabelsWriteStatus", command);
            return;
        }

        command.request.uiCommandVisibility = bindings.getUiCommandVisibility();
        const isCurrent = captureDatasetConsumerScope(bindings);
        if (!isCurrent()) {
            return;
        }
        const result = await bindings.writeValueLabels(command.request);

        if (!isCurrent()) {
            return;
        }
        bindings.renderValueLabelUpdate(result);

        if (isCurrent() && result.status === "updated") {
            void readValueLabels(result.objectName);
            if (isCurrent()) {
                bindings.refreshRuntimeEvents();
            }
        }
    };

    const readDeclaredMissing = async function(
        objectName: string
    ): Promise<void> {
        const isCurrent = captureDatasetConsumerScope(bindings);
        if (!isCurrent()) {
            return;
        }
        const snapshot = await bindings.readDeclaredMissing(objectName || "");

        if (isCurrent()) {
            bindings.renderDeclaredMissing(snapshot);
        }
    };

    const writeDeclaredMissing = async function(): Promise<void> {
        const controls = bindings.controls;
        const selection = bindings.getState().selection;
        const command = selection.kind === "variable-cell"
            ? createDeclaredMissingUpdateFromSelection(
                selection,
                controls.declaredMissingVariable.value,
                controls.declaredMissingValue.value,
                controls.declaredMissingLabel.value
            )
            : createDeclaredMissingUpdateFromInputs(
                bindings.getObjectName(),
                controls.declaredMissingVariable.value,
                controls.declaredMissingValue.value,
                controls.declaredMissingLabel.value
            );

        if (!command.request) {
            bindings.renderStatus("declaredMissingWriteStatus", command);
            return;
        }

        command.request.uiCommandVisibility = bindings.getUiCommandVisibility();
        const isCurrent = captureDatasetConsumerScope(bindings);
        if (!isCurrent()) {
            return;
        }
        const result = await bindings.writeDeclaredMissing(command.request);

        if (!isCurrent()) {
            return;
        }
        bindings.renderDeclaredMissingUpdate(result);

        if (isCurrent() && result.status === "updated") {
            void readDeclaredMissing(result.objectName);
            if (isCurrent()) {
                bindings.refreshRuntimeEvents();
            }
        }
    };

    return {
        readVariableMetadata,
        writeVariableMetadata,
        readValueLabels,
        writeValueLabels,
        readDeclaredMissing,
        writeDeclaredMissing
    };
};

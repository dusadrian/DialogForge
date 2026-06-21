import type {
    DatasetEditorState
} from "../state/datasetEditorState";
import {
    datasetEditorReducer
} from "../state/datasetEditorState";
import {
    createEditStartFromSelection
} from "../commands/editCommands";
import {
    createEditControlPlan
} from "../selection/selectionControls";


export interface DatasetEditControllerBindings {
    getState(): DatasetEditorState;
    setState(state: DatasetEditorState): void;
    renderSelection(): void;
    renderStatus(result: { status: string; message: string }): void;
    writeCell(): void;
    writeVariableMetadata(): void;
}


export interface DatasetEditController {
    begin(): void;
    cancel(): void;
    commit(): void;
}


const inputById = function(id: string): HTMLInputElement {
    const element = document.getElementById(id);

    if (!(element instanceof HTMLInputElement)) {
        throw new Error("Missing dataset edit input: " + id);
    }

    return element;
};


export const createDatasetEditController = function(
    bindings: DatasetEditControllerBindings
): DatasetEditController {
    const editInput = function(): HTMLInputElement | null {
        const plan = createEditControlPlan(bindings.getState().selection);

        return plan.status === "ready"
            ? inputById(plan.inputId)
            : null;
    };

    const begin = function(): void {
        const state = bindings.getState();
        const command = createEditStartFromSelection(
            state.selection,
            editInput()?.value || ""
        );

        if (command.status !== "ready") {
            bindings.renderStatus(command);
            return;
        }

        bindings.setState(datasetEditorReducer(state, {
            type: "beginEdit",
            value: command.value
        }));
        bindings.renderSelection();
        editInput()?.focus();
    };

    const cancel = function(): void {
        const state = bindings.getState();
        const input = editInput();

        if (state.editing.active && input) {
            input.value = state.editing.value;
        }

        bindings.setState(datasetEditorReducer(state, {
            type: "endEdit"
        }));
        bindings.renderSelection();
    };

    const commit = function(): void {
        const selection = bindings.getState().selection;

        if (selection.kind === "data-cell") {
            bindings.writeCell();
            return;
        }

        if (selection.kind === "variable-cell") {
            bindings.writeVariableMetadata();
            return;
        }

        bindings.renderStatus({
            status: "unavailable",
            message: "Select a data cell or variable metadata cell before committing an edit."
        });
    };

    return {
        begin,
        cancel,
        commit
    };
};

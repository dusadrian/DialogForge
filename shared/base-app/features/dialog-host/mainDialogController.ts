import type {
    DialogExecutionResult
} from "../../../runtime/provider-contract/runtimeProvider";


export interface MainDialogControllerBindings {
    executeDialog(input: {
        dialogId: string;
        owner: string;
        inputs: Record<string, unknown>;
        source: string;
    }): Promise<DialogExecutionResult>;
}


export interface MainDialogController {
    executeGoTo(
        dialogId: string,
        owner: string,
        mode: "case" | "variable",
        datasetName: string
    ): Promise<void>;
}


export const createMainDialogController = function(
    bindings: MainDialogControllerBindings
): MainDialogController {
    const executeGoTo = async function(
        dialogId: string,
        owner: string,
        mode: "case" | "variable",
        datasetName: string
    ): Promise<void> {
        await bindings.executeDialog({
            dialogId,
            owner,
            inputs: { mode, datasetName },
            source: "base-app.dataset-navigation"
        });
    };

    return {
        executeGoTo
    };
};

import type { DialogExecutionRequest, DialogExecutionResult } from "../provider-contract/runtimeProvider";


export const createDialogExecutionRequest = function(input: Partial<DialogExecutionRequest>): DialogExecutionRequest {
    return {
        dialogId: String(input && input.dialogId ? input.dialogId : ""),
        owner: String(input && input.owner ? input.owner : ""),
        inputs: input && input.inputs ? input.inputs : {},
        source: String(input && input.source ? input.source : "base-app.dialog")
    };
};


export const createDialogExecutionResult = function(input: Partial<DialogExecutionResult>): DialogExecutionResult {
    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        dialogId: input.dialogId || "",
        owner: input.owner || "",
        outputs: input.outputs || {},
        message: input.message || "",
        executedAt: new Date().toISOString()
    };
};

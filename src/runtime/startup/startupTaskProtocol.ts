import type {
    StartupTaskExecutionRequest,
    StartupTaskExecutionResult
} from "../provider-contract/runtimeProvider";


export const createStartupTaskExecutionRequest = function(
    input: Partial<StartupTaskExecutionRequest>
): StartupTaskExecutionRequest {
    return {
        taskId: String(input && input.taskId ? input.taskId : ""),
        owner: String(input && input.owner ? input.owner : ""),
        source: String(input && input.source ? input.source : "base-app.startup")
    };
};


export const createStartupTaskExecutionResult = function(
    input: Partial<StartupTaskExecutionResult>
): StartupTaskExecutionResult {
    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        taskId: input.taskId || "",
        owner: input.owner || "",
        message: input.message || "",
        executedAt: new Date().toISOString()
    };
};

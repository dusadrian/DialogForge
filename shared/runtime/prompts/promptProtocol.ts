import type {
    PromptAnswerRequest,
    PromptRecord,
    PromptRequest,
    PromptResult,
    PromptSnapshot
} from "../provider-contract/runtimeProvider";


export const createPromptRequest = function(input: Partial<PromptRequest>): PromptRequest {
    return {
        prompt: String(input && input.prompt ? input.prompt : ""),
        kind: String(input && input.kind ? input.kind : "text"),
        source: String(input && input.source ? input.source : "base-app.prompt")
    };
};


export const createPromptAnswerRequest = function(input: Partial<PromptAnswerRequest>): PromptAnswerRequest {
    return {
        promptId: String(input && input.promptId ? input.promptId : ""),
        answer: input && input.answer !== undefined ? input.answer : ""
    };
};


export const createPromptRecord = function(input: Partial<PromptRecord>): PromptRecord {
    return {
        id: input.id || "",
        providerId: input.providerId || "",
        prompt: input.prompt || "",
        kind: input.kind || "text",
        status: input.status || "pending",
        answer: input.answer === undefined ? "" : input.answer,
        createdAt: input.createdAt || new Date().toISOString(),
        answeredAt: input.answeredAt || ""
    };
};


export const createPromptResult = function(input: Partial<PromptResult>): PromptResult {
    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        prompt: input.prompt || null,
        message: input.message || "",
        updatedAt: new Date().toISOString()
    };
};


export const createPromptSnapshot = function(input: Partial<PromptSnapshot>): PromptSnapshot {
    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        prompts: input.prompts || [],
        message: input.message || "",
        refreshedAt: new Date().toISOString()
    };
};

import type {
    PromptAnswerRequest,
    RuntimeExtensionMethodRequest
} from "../provider-contract/runtimeProvider";
import { createPromptAnswerRequest } from "./promptProtocol";


export interface RuntimePromptReplyPayload {
    parentId: string;
    promptId: string;
    reply: string;
}


export const readRuntimePromptReplyPayload = function(
    request: Partial<RuntimeExtensionMethodRequest>
): RuntimePromptReplyPayload {
    const params = request && request.params && typeof request.params === "object"
        && !Array.isArray(request.params)
        ? request.params as Record<string, unknown>
        : {};

    return {
        parentId: String(params.parentId || ""),
        promptId: String(params.promptId || params.parentId || ""),
        reply: String(params.reply || "")
    };
};


export const createRuntimePromptReplyAnswerRequest = function(
    request: Partial<RuntimeExtensionMethodRequest>
): PromptAnswerRequest {
    const payload = readRuntimePromptReplyPayload(request);

    return createPromptAnswerRequest({
        promptId: payload.promptId,
        answer: payload.reply
    });
};

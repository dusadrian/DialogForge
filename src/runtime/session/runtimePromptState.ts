import {
    createPromptRecord,
    createPromptResult,
    createPromptSnapshot
} from "../prompts/promptProtocol";
import type {
    PromptAnswerRequest,
    PromptRequest,
    PromptResult,
    PromptSnapshot
} from "../provider-contract/runtimeProvider";


export interface RuntimePromptState {
    createSnapshot(providerId: string): PromptSnapshot;
    request(providerId: string, request: PromptRequest): PromptResult;
    answer(providerId: string, request: PromptAnswerRequest): PromptResult;
}


export const createRuntimePromptState = function(): RuntimePromptState {
    const prompts: PromptSnapshot["prompts"] = [];
    let nextPromptId = 1;

    return {
        createSnapshot: function(providerId) {
            return createPromptSnapshot({
                status: "ready",
                providerId,
                prompts: prompts.slice(0),
                message: "Prompt queue read from session memory."
            });
        },
        request: function(providerId, request) {
            if (!request.prompt) {
                return createPromptResult({
                    status: "invalid",
                    providerId,
                    message: "Prompt text is required."
                });
            }

            const prompt = createPromptRecord({
                id: "prompt-" + nextPromptId,
                providerId,
                prompt: request.prompt,
                kind: request.kind,
                status: "pending"
            });

            nextPromptId += 1;
            prompts.unshift(prompt);

            return createPromptResult({
                status: "queued",
                providerId,
                prompt,
                message: "Placeholder prompt queued without blocking command execution."
            });
        },
        answer: function(providerId, request) {
            const prompt = prompts.find((candidate) => {
                return candidate.id === request.promptId;
            });

            if (!prompt) {
                return createPromptResult({
                    status: "not-found",
                    providerId,
                    message: "Prompt was not found."
                });
            }

            if (prompt.status !== "pending") {
                return createPromptResult({
                    status: "already-answered",
                    providerId,
                    prompt,
                    message: "Prompt is already answered."
                });
            }

            prompt.status = "answered";
            prompt.answer = request.answer;
            prompt.answeredAt = new Date().toISOString();

            return createPromptResult({
                status: "answered",
                providerId,
                prompt,
                message: "Placeholder prompt answer stored in session memory."
            });
        }
    };
};

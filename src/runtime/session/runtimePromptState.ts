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
    invalidate(): void;
    createSnapshot(providerId: string): PromptSnapshot;
    request(providerId: string, request: PromptRequest): PromptResult;
    answer(providerId: string, request: PromptAnswerRequest): PromptResult;
}


let nextPromptNamespace = 1;


export const createRuntimePromptState = function(): RuntimePromptState {
    const promptNamespace = nextPromptNamespace;
    nextPromptNamespace += 1;
    const prompts: PromptSnapshot["prompts"] = [];
    let nextPromptId = 1;

    return {
        invalidate: function() {
            for (const prompt of prompts) {
                if (prompt.status === "pending") {
                    prompt.status = "retired";
                }
            }
        },
        createSnapshot: function(providerId) {
            return createPromptSnapshot({
                status: "ready",
                providerId,
                prompts: prompts.slice(0),
                message: "Prompt queue read from session memory."
            });
        },
        request: function(providerId, request) {
            if (!request.prompt && request.allowEmpty !== true) {
                return createPromptResult({
                    status: "invalid",
                    providerId,
                    message: "Prompt text is required."
                });
            }

            const prompt = createPromptRecord({
                id: "prompt-" + promptNamespace + "-" + nextPromptId,
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

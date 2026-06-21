import {
    createPromptResult,
    createPromptSnapshot
} from "../prompts/promptProtocol";
import type {
    PromptAnswerRequest,
    PromptRequest,
    PromptResult,
    PromptSnapshot,
    RuntimeSessionSnapshot
} from "../provider-contract/runtimeProvider";
import type {
    RuntimePromptState
} from "./runtimePromptState";


export interface RuntimePromptExecutionControllerOptions {
    promptState: RuntimePromptState;
    getSnapshot(): RuntimeSessionSnapshot;
}


export interface RuntimePromptExecutionController {
    listPrompts(): Promise<PromptSnapshot>;
    requestPrompt(request: PromptRequest): Promise<PromptResult>;
    answerPrompt(request: PromptAnswerRequest): Promise<PromptResult>;
}


export const createRuntimePromptExecutionController = function(
    options: RuntimePromptExecutionControllerOptions
): RuntimePromptExecutionController {
    return {
        listPrompts: async function() {
            const snapshot = options.getSnapshot();

            if (snapshot.status !== "ready") {
                return createPromptSnapshot({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    message: "Runtime session is not ready."
                });
            }

            return options.promptState.createSnapshot(snapshot.providerId);
        },
        requestPrompt: async function(request) {
            const snapshot = options.getSnapshot();

            if (snapshot.status !== "ready") {
                return createPromptResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    message: "Runtime session is not ready."
                });
            }

            return options.promptState.request(snapshot.providerId, request);
        },
        answerPrompt: async function(request) {
            const snapshot = options.getSnapshot();

            if (snapshot.status !== "ready") {
                return createPromptResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    message: "Runtime session is not ready."
                });
            }

            return options.promptState.answer(snapshot.providerId, request);
        }
    };
};

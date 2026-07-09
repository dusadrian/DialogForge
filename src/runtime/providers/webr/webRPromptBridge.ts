import {
    createRuntimePromptReplyAnswerRequest,
    readRuntimePromptReplyPayload
} from "../../prompts/runtimePromptReplyMethod";
import {
    createPromptRequest
} from "../../prompts/promptProtocol";
import type {
    PromptAnswerRequest,
    PromptResult,
    RuntimeProvider,
    RuntimeSessionSnapshot,
    TranscriptEvent
} from "../../provider-contract/runtimeProvider";
import {
    createRuntimeSessionManager
} from "../../session/runtimeSessionManager";
import {
    createBrowserWebRSessionSnapshot
} from "./webRBrowserStartup";


export interface WebRPromptRuntime {
    writeConsole?(input: string): void;
}

export interface WebRPromptReplyResult {
    ok: boolean;
    promptId: string;
    reply: unknown;
    message: string;
}

export interface WebRRuntimePromptInput {
    parentId: string;
    prompt: string;
    password?: boolean;
    source?: string;
}

export interface WebRPromptCoordinator {
    requestPrompt(input: WebRRuntimePromptInput): Promise<TranscriptEvent | null>;
    answerPrompt(input: unknown): Promise<WebRPromptReplyResult>;
    listPrompts(): Promise<unknown>;
}

export interface WebRPromptCoordinatorBindings {
    getRuntime(): WebRPromptRuntime | null | undefined;
}


const createBrowserWebRPromptProvider = function(): RuntimeProvider {
    const snapshot: RuntimeSessionSnapshot = createBrowserWebRSessionSnapshot(
        "ready",
        "Browser WebR runtime is ready for prompts.",
        "connected"
    );

    return {
        manifest: {
            id: "webr",
            label: "WebR",
            language: "r",
            status: "experimental",
            capabilities: []
        },
        createSession: function() {
            return snapshot;
        }
    };
};


export const createWebRPromptAnswerRequest = function(
    input: unknown
): PromptAnswerRequest {
    return createRuntimePromptReplyAnswerRequest(input || {});
};


export const sendWebRPromptReply = function(
    runtime: WebRPromptRuntime | null | undefined,
    input: unknown
): WebRPromptReplyResult {
    const answerRequest = createWebRPromptAnswerRequest(input);
    const payload = readRuntimePromptReplyPayload(input || {});
    const reply = String(payload.reply ?? "");
    const promptId = String(answerRequest.promptId || "");

    if (!promptId) {
        return {
            ok: false,
            promptId,
            reply: payload.reply,
            message: "Prompt id is required."
        };
    }

    if (typeof runtime?.writeConsole !== "function") {
        return {
            ok: false,
            promptId,
            reply: payload.reply,
            message: "WebR console input is not available."
        };
    }

    runtime.writeConsole(reply);

    return {
        ok: true,
        promptId,
        reply: payload.reply,
        message: "Prompt reply sent to WebR console input."
    };
};


export const createWebRPromptCoordinator = function(
    bindings: WebRPromptCoordinatorBindings
): WebRPromptCoordinator {
    const manager = createRuntimeSessionManager(
        createBrowserWebRPromptProvider()
    );

    return {
        requestPrompt: async function(input) {
            const parentId = String(input.parentId || "").trim();
            const prompt = String(input.prompt || "");

            if (!parentId || !prompt) {
                return null;
            }

            const result: PromptResult = await manager.requestPrompt(
                createPromptRequest({
                    prompt,
                    kind: input.password ? "password" : "text",
                    source: input.source || "browser.webr.prompt"
                })
            );

            if (!result.prompt) {
                return null;
            }

            return {
                type: "prompt",
                commandKind: "prompts.request",
                source: input.source || "browser.webr.prompt",
                text: "",
                createdAt: result.prompt.createdAt,
                id: result.prompt.id,
                parentId,
                prompt: result.prompt.prompt,
                password: Boolean(input.password)
            };
        },
        answerPrompt: async function(input) {
            const answerRequest = createWebRPromptAnswerRequest(input);

            if (answerRequest.promptId) {
                await manager.answerPrompt(answerRequest);
            }

            return sendWebRPromptReply(bindings.getRuntime(), input);
        },
        listPrompts: function() {
            return manager.listPrompts();
        }
    };
};

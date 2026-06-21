import type {
    PromptSnapshot
} from "../../../runtime/provider-contract/runtimeProvider";


export interface PendingPrompt {
    id: string;
}


export interface MainPromptControllerBindings {
    promptText: HTMLInputElement;
    promptAnswer: HTMLInputElement;
    getSnapshot(): PromptSnapshot | null;
    findPendingPrompt(snapshot: PromptSnapshot | null): PendingPrompt | null;
    renderPrompts(snapshot: PromptSnapshot): void;
}


export interface MainPromptController {
    refresh(): Promise<void>;
    queue(): Promise<void>;
    answerFirst(): Promise<void>;
}


export const createMainPromptController = function(
    bindings: MainPromptControllerBindings
): MainPromptController {
    const refresh = async function(): Promise<void> {
        const snapshot = await window.dialogForge.listPrompts();

        bindings.renderPrompts(snapshot);
    };

    const queue = async function(): Promise<void> {
        const result = await window.dialogForge.requestPrompt({
            prompt: bindings.promptText.value,
            kind: "text",
            source: "base-app.prompt"
        });

        if (result.status === "queued") {
            await refresh();
        }
    };

    const answerFirst = async function(): Promise<void> {
        const pending = bindings.findPendingPrompt(bindings.getSnapshot());

        if (!pending) {
            return;
        }

        await window.dialogForge.answerPrompt({
            promptId: pending.id,
            answer: bindings.promptAnswer.value
        });
        await refresh();
    };

    return {
        refresh,
        queue,
        answerFirst
    };
};

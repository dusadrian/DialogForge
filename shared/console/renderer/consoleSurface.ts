import type {
    CompletionModel
} from "../terminal/completionTypes";
import type {
    ConsoleSessionState
} from "../services/consoleSessionState";
import { createConsoleTranscriptService } from "../services/consoleTranscriptService";
import { createConsoleFlowView } from "../views/consoleFlowView";
import { createConsoleRequestInputView } from "../views/requestInputView";
import { createTerminalConsoleEditorInputView } from "../views/terminalEditorInputView";

type ConsoleTranscriptService = ReturnType<
    typeof createConsoleTranscriptService
>;
type ConsoleFlowView = ReturnType<typeof createConsoleFlowView>;
type ConsoleRequestInputView = ReturnType<
    typeof createConsoleRequestInputView
>;
type ConsoleEditorInputView = ReturnType<
    typeof createTerminalConsoleEditorInputView
>;

interface ConsoleInputHost extends HTMLElement {
    dialogForgeConsoleInputView?: ConsoleEditorInputView;
}

export interface ConsoleSurfaceOptions {
    document: Document;
    session: ConsoleSessionState;
    completionModel: CompletionModel;
    getHistory: () => string[];
    submitRequestReply: (
        reply: string,
        request: { activityId: string }
    ) => Promise<void>;
    isCodeFragmentComplete: (
        code: string
    ) => Promise<"complete" | "incomplete" | "invalid" | "unknown">;
    executeCode: (
        code: string
    ) => Promise<"ok" | "incomplete" | void>;
    interruptExecution: () => Promise<void>;
    showHelpTopic: (request: {
        query: string;
        topic: string;
        package?: string;
        allowSearch?: boolean;
    }) => void;
    writeClipboardText: (text: string) => Promise<void> | void;
}

export interface ConsoleSurface {
    initializeFlow: () => void;
    initializeInput: () => Promise<void>;
    isInputReady: () => boolean;
    getTranscript: () => ConsoleTranscriptService | null;
    getText: () => string;
    setText: (value: string) => void;
    focus: () => void;
    clear: () => void;
    resize: () => void;
    scrollToBottom: () => boolean;
    historyPrevious: () => boolean;
    historyNext: () => boolean;
}

const elementById = function(
    document: Document,
    id: string
): HTMLElement {
    const element = document.getElementById(id);

    if (!element) {
        throw new Error("Missing console surface element: " + id);
    }

    return element;
};

export const createConsoleSurface = function(
    options: ConsoleSurfaceOptions
): ConsoleSurface {
    let transcript: ConsoleTranscriptService | null = null;
    let flow: ConsoleFlowView | null = null;
    let requestInput: ConsoleRequestInputView | null = null;
    let commandInput: ConsoleEditorInputView | null = null;
    let inputReady = false;
    let activePromptId = "";

    const commandHost = function(): ConsoleInputHost {
        return elementById(
            options.document,
            "visibleCommandInput"
        ) as ConsoleInputHost;
    };

    const focus = function(): void {
        if (commandInput) {
            commandInput.focus();
            return;
        }

        commandHost().focus();
    };

    const initializeFlow = function(): void {
        if (flow) {
            return;
        }

        transcript = createConsoleTranscriptService({
            submitRequestReply: options.submitRequestReply
        });
        flow = createConsoleFlowView({
            consoleService: transcript,
            focusCommandInput: focus,
            focusRequestInput: function() {
                requestInput?.focus?.();
            },
            writeClipboardText: options.writeClipboardText
        });
        flow.mount(elementById(options.document, "consoleTerminal"));

        requestInput = createConsoleRequestInputView({
            replyToRequest: async function(value: string) {
                await transcript?.replyToPrompt?.(value);
            },
            interruptExecution: options.interruptExecution
        });
        requestInput.mount(flow.getRequestInputHost?.());

        transcript.subscribe(function(): void {
            const activeRequest = transcript?.getActiveRequest?.() || null;
            const nextPromptId = String(activeRequest?.promptId || "");

            if (!nextPromptId) {
                activePromptId = "";
                requestInput?.setPasswordMode?.(false);
                return;
            }

            if (nextPromptId === activePromptId) {
                return;
            }

            activePromptId = nextPromptId;
            requestInput?.setPasswordMode?.(
                Boolean(activeRequest?.password)
            );
            requestInput?.clear?.();
            flow?.scrollToBottom?.();

            requestAnimationFrame(function(): void {
                requestInput?.focus?.();
            });
        });
    };

    const initializeInput = async function(): Promise<void> {
        if (inputReady) {
            return;
        }

        initializeFlow();
        const inputHost = flow?.getInputHost?.() as HTMLElement | null;

        if (!inputHost) {
            throw new Error("DialogR console editor input view is not loaded.");
        }

        commandInput = createTerminalConsoleEditorInputView({
            isCodeFragmentComplete: options.isCodeFragmentComplete,
            executeCode: options.executeCode,
            getPromptState: function() {
                return options.session.getPromptState();
            },
            onDidPromptState: options.session.onDidPromptState,
            getSessionPhase: options.session.getSessionPhase,
            onDidSessionPhase: options.session.onDidSessionPhase,
            getRuntimeBusy: options.session.isRuntimeBusy,
            onDidRuntimeBusy: options.session.onDidRuntimeBusy,
            getHistory: options.getHistory,
            getCompletionModel: function() {
                return options.completionModel;
            },
            interruptExecution: options.interruptExecution,
            showHelpTopic: options.showHelpTopic,
            scrollToPrompt: function(): void {
                flow?.scrollToBottom?.();
            }
        });
        commandInput.mount(inputHost);
        commandHost().dialogForgeConsoleInputView = commandInput;

        inputReady = true;
        options.document.body.classList.add("consoleMonacoReady");
    };

    return {
        initializeFlow,
        initializeInput,
        isInputReady: function(): boolean {
            return inputReady;
        },
        getTranscript: function(): ConsoleTranscriptService | null {
            return transcript;
        },
        getText: function(): string {
            if (commandInput) {
                return String(commandInput.getText() || "");
            }

            return String(commandHost().textContent || "");
        },
        setText: function(value: string): void {
            const text = String(value || "")
                .replace(/\r\n/g, "\n")
                .replace(/\r/g, "\n");

            if (commandInput) {
                commandInput.setText(text);
                return;
            }

            commandHost().textContent = text;
        },
        focus,
        clear: function(): void {
            transcript?.clear?.();
        },
        resize: function(): void {},
        scrollToBottom: function(): boolean {
            if (!flow) {
                return false;
            }

            flow.scrollToBottom();
            return true;
        },
        historyPrevious: function(): boolean {
            if (!commandInput) {
                return false;
            }

            commandInput.historyPrevious();
            return true;
        },
        historyNext: function(): boolean {
            if (!commandInput) {
                return false;
            }

            commandInput.historyNext();
            return true;
        }
    };
};

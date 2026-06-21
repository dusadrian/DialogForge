import type {
    RuntimeSessionSnapshot
} from "../../runtime/provider-contract/runtimeProvider";
import type {
    ConsoleSessionState
} from "../services/consoleSessionState";
import type {
    CompletionModel
} from "../terminal/completionTypes";
import {
    createConsoleSurface
} from "./consoleSurface";
import {
    createConsoleVisibleCommandController
} from "./consoleVisibleCommandController";


export interface MainConsoleCoordinatorBindings {
    document: Document;
    session: ConsoleSessionState;
    completionModel: CompletionModel;
    getHistory(): string[];
    getRuntimeSession(): RuntimeSessionSnapshot | null;
    startRuntimeSession(): Promise<RuntimeSessionSnapshot>;
    renderStatus(snapshot: RuntimeSessionSnapshot): void;
    recordHistory(text: string): void;
    registerCompletionInput(text: string): void;
    navigateFallbackHistory(direction: number): void;
    executeRuntimeMethod(input: {
        method: string;
        params: Record<string, unknown>;
        source: string;
    }): Promise<{ value?: unknown }>;
    executeVisibleCommand(input: {
        text: string;
        source: string;
    }): Promise<unknown>;
    openHelpTopic(input: {
        topic: string;
        package?: string;
        allowSearch?: boolean;
        source: string;
    }): void;
}


export const createMainConsoleCoordinator = function(
    bindings: MainConsoleCoordinatorBindings
) {
    let surface: ReturnType<typeof createConsoleSurface> | null = null;

    const interrupt = async function(): Promise<void> {
        await bindings.executeRuntimeMethod({
            method: "runtime.interrupt",
            params: {},
            source: "base-app.console-input"
        });
        bindings.session.setRuntimeBusy(false);
    };

    const checkCodeFragmentComplete = async function(
        code: string
    ): Promise<"complete" | "incomplete" | "invalid" | "unknown"> {
        const result = await bindings.executeRuntimeMethod({
            method: "check_completeness",
            params: {
                code: String(code || "")
            },
            source: "base-app.console-input"
        });
        const value = result.value && typeof result.value === "object"
            ? result.value as { state?: unknown }
            : {};
        const state = String(value.state || "").toLowerCase();

        if (
            state === "complete"
            || state === "incomplete"
            || state === "invalid"
        ) {
            return state;
        }

        return "unknown";
    };

    const visibleCommand = createConsoleVisibleCommandController({
        getSession: bindings.getRuntimeSession,
        startSession: bindings.startRuntimeSession,
        renderStatus: bindings.renderStatus,
        recordHistory: bindings.recordHistory,
        registerCompletionInput: bindings.registerCompletionInput,
        setRuntimeBusy: bindings.session.setRuntimeBusy,
        executeCommand: bindings.executeVisibleCommand
    });

    const executeText = function(
        rawText: string,
        source: string
    ): Promise<"ok" | void> {
        return visibleCommand.executeText(rawText, source);
    };

    const getSurface = function(): ReturnType<typeof createConsoleSurface> {
        if (surface) {
            return surface;
        }

        surface = createConsoleSurface({
            document: bindings.document,
            session: bindings.session,
            completionModel: bindings.completionModel,
            getHistory: bindings.getHistory,
            submitRequestReply: async function(
                reply: string,
                request: { activityId: string }
            ): Promise<void> {
                await bindings.executeRuntimeMethod({
                    method: "reply_prompt",
                    params: {
                        parentId: String(request.activityId || ""),
                        reply: String(reply || "")
                    },
                    source: "base-app.console-prompt"
                });
            },
            isCodeFragmentComplete: checkCodeFragmentComplete,
            executeCode: async function(code: string) {
                return executeText(code, "base-app.visible-command");
            },
            interruptExecution: interrupt,
            showHelpTopic: function(request): void {
                bindings.openHelpTopic({
                    topic: request.topic,
                    package: request.package,
                    allowSearch: request.allowSearch,
                    source: "base-app.console-help"
                });
            }
        });

        return surface;
    };

    const commandHost = function(): HTMLElement {
        const host = bindings.document.getElementById("visibleCommandInput");

        if (!host) {
            throw new Error("Missing console command input host.");
        }

        return host;
    };

    const getText = function(): string {
        return surface
            ? surface.getText()
            : String(commandHost().textContent || "");
    };

    const setText = function(value: string): void {
        if (surface) {
            surface.setText(value);
            return;
        }

        commandHost().textContent = String(value || "")
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n");
    };

    const focus = function(): void {
        if (surface) {
            surface.focus();
            return;
        }

        commandHost().focus();
    };

    const executeCurrent = async function(): Promise<void> {
        const text = getText().trim();

        if (!text) {
            return;
        }

        setText("");
        focus();
        await executeText(text, "base-app.visible-command");
    };

    const handleFallbackKeydown = function(event: KeyboardEvent): void {
        if (surface?.isInputReady()) {
            return;
        }

        const ctrlCmd = !!(event.ctrlKey || event.metaKey);

        if (ctrlCmd && !event.shiftKey && !event.altKey) {
            if (event.key === "ArrowDown") {
                event.preventDefault();
                getSurface().scrollToBottom();
                focus();
                return;
            }

            if (
                event.key === "ArrowLeft" ||
                event.key === "ArrowRight"
            ) {
                event.preventDefault();
                focus();
                return;
            }
        }

        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void executeCurrent();
            return;
        }

        if (event.key === "ArrowUp") {
            event.preventDefault();
            bindings.navigateFallbackHistory(-1);
            return;
        }

        if (event.key === "ArrowDown") {
            event.preventDefault();
            bindings.navigateFallbackHistory(1);
        }
    };

    return {
        getSessionPhase: bindings.session.getSessionPhase,
        notifySessionPhase: bindings.session.notifySessionPhase,
        onDidSessionPhase: bindings.session.onDidSessionPhase,
        onDidPromptState: bindings.session.onDidPromptState,
        setPromptState: bindings.session.setPromptState,
        onDidRuntimeBusy: bindings.session.onDidRuntimeBusy,
        setRuntimeBusy: bindings.session.setRuntimeBusy,
        interrupt,
        initializeFlow: function(): void {
            getSurface().initializeFlow();
        },
        initializeInput: function(): Promise<void> {
            return getSurface().initializeInput();
        },
        getTranscript: function() {
            return surface?.getTranscript() || null;
        },
        hasSurface: function(): boolean {
            return surface !== null;
        },
        getText,
        setText,
        focus,
        executeText,
        executeCurrent,
        handleFallbackKeydown,
        clear: function(): void {
            surface?.clear();
        },
        resize: function(): void {
            surface?.resize();
        },
        scrollToBottom: function(): boolean {
            return surface?.scrollToBottom() || false;
        },
        historyPrevious: function(): boolean {
            return surface?.historyPrevious() || false;
        },
        historyNext: function(): boolean {
            return surface?.historyNext() || false;
        }
    };
};

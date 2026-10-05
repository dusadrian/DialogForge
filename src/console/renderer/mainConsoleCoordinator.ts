import type {
    BuildContextualHelpRequest,
    ParseConsoleHelpCommand
} from "../terminal/contextualHelp";

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
import { normalizeConsoleCommandText } from "../commandText";
import { readConsoleOutputWidth } from "./consoleOutputWidth";
import { createConsoleInterruptController } from "./consoleInterruptController";
import type {
    ConsoleEditorSettings
} from "../consoleTypography";


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
    }): Promise<{ status?: string; message?: string; value?: unknown }>;
    executeVisibleCommand(input: {
        text: string;
        source: string;
        outputWidth?: number;
    }): Promise<unknown>;
    openHelpTopic(input: {
        topic: string;
        package?: string;
        allowSearch?: boolean;
        kind?: "topic" | "home";
        source: string;
    }): void;
    readClipboardText?(): Promise<string> | string;
    buildContextualHelpRequest?: BuildContextualHelpRequest;
    parseHelpCommand?: ParseConsoleHelpCommand;
    writeClipboardText(text: string): Promise<void> | void;
}


export const createMainConsoleCoordinator = function(
    bindings: MainConsoleCoordinatorBindings
) {
    let surface: ReturnType<typeof createConsoleSurface> | null = null;
    let historyPersistenceFailurePending = false;

    const reportHistoryPersistenceFailure = function(): void {
        const transcript = surface?.getTranscript();

        if (!transcript) {
            historyPersistenceFailurePending = true;
            return;
        }

        historyPersistenceFailurePending = false;
        const message = "Warning: Console history could not be saved. "
            + "Commands remain available in this window; saved history may be incomplete.\n";

        try {
            transcript.recordRuntimeMessageStream({
                name: "warning",
                origin: "console",
                text: message
            });
        }
        catch {
            // History notices are advisory even when the transcript is unavailable.
            console.warn(message.trim());
        }
    };

    const interruptController = createConsoleInterruptController({
        getRuntimeSession: bindings.getRuntimeSession,
        getActiveActivityId: function(): string {
            return surface?.getTranscript()?.getActiveRequest()?.activityId || "";
        },
        executeInterrupt: function() {
            return bindings.executeRuntimeMethod({
                method: "runtime.interrupt",
                params: {},
                source: "base-app.console-input"
            });
        },
        reportFailure: function(message, activityId): void {
            surface?.getTranscript()?.recordRuntimeMessageStream({
                parent_id: activityId || undefined,
                name: "stderr",
                origin: "console",
                text: message + "\n"
            });
        }
    });
    const interrupt = interruptController.interrupt;

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
        readOutputWidth: () => readConsoleOutputWidth(bindings.document, window),
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
                request: { activityId: string; promptId?: string }
            ): Promise<void> {
                const result = await bindings.executeRuntimeMethod({
                    method: "reply_prompt",
                    params: {
                        parentId: String(request.activityId || ""),
                        promptId: String(request.promptId || request.activityId || ""),
                        reply: String(reply || "")
                    },
                    source: "base-app.console-prompt"
                });

                const value = result.value;
                const accepted = value === true || (
                    value !== null && typeof value === "object"
                    && (value as { ok?: unknown }).ok === true
                );

                if (result.status !== "ready" || !accepted) {
                    throw new Error("Prompt reply was not accepted. You can retry or interrupt the command.");
                }
            },
            isCodeFragmentComplete: checkCodeFragmentComplete,
            executeCode: async function(code: string) {
                return executeText(code, "base-app.visible-command");
            },
            interruptExecution: interrupt,
            buildContextualHelpRequest: bindings.buildContextualHelpRequest,
            parseHelpCommand: bindings.parseHelpCommand,
            recordHelpCommand: function(code: string): void {
                bindings.recordHistory(code);
                bindings.registerCompletionInput(code);
            },
            showHelpTopic: function(request): void {
                bindings.openHelpTopic({
                    topic: request.topic,
                    package: request.package,
                    allowSearch: request.allowSearch,
                    kind: request.kind,
                    source: "base-app.console-help"
                });
            },
            readClipboardText: bindings.readClipboardText,
            writeClipboardText: bindings.writeClipboardText
        });

        return surface;
    };

    const initializeFlow = function(): void {
        getSurface().initializeFlow();

        if (historyPersistenceFailurePending) {
            reportHistoryPersistenceFailure();
        }
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

        commandHost().textContent = normalizeConsoleCommandText(value);
    };

    const focus = function(): void {
        if (surface) {
            surface.focus();
            return;
        }

        commandHost().focus();
    };

    const focusAfterPromptLayout = function(): void {
        focus();

        requestAnimationFrame(function(): void {
            focus();

            requestAnimationFrame(function(): void {
                focus();
            });
        });
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
                focusAfterPromptLayout();
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
        reportHistoryPersistenceFailure,
        initializeFlow,
        initializeInput: function(): Promise<void> {
            initializeFlow();
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
        focusAfterPromptLayout,
        executeText,
        executeWithReceipt: visibleCommand.executeWithReceipt,
        executeCurrent,
        handleFallbackKeydown,
        clear: function(): void {
            surface?.clear();
        },
        retireRuntimeExecution: function(): void {
            interruptController.retire();
            visibleCommand.retire();
            bindings.session.setRuntimeBusy(false);
            surface?.retireRuntimeExecution();
        },
        resize: function(): void {
            surface?.resize();
        },
        setSettings: function(settings: ConsoleEditorSettings): void {
            getSurface().setSettings(settings);
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

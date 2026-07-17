import {
    createMainConsoleCoordinator
} from "../console/renderer/mainConsoleCoordinator";
import {
    createConsoleToolbarController
} from "../console/renderer/consoleToolbarController";
import {
    createConsoleCommandHistory
} from "../console/services/consoleCommandHistory";
import type {
    ConsoleHistoryScope
} from "../console/services/consoleCommandHistory";
import {
    createConsoleSessionState
} from "../console/services/consoleSessionState";
import {
    createCompletionModel
} from "../console/terminal/completionModel";
import type {
    CompletionModelOptions
} from "../console/terminal/completionTypes";
import type {
    ProductConsoleStateChip
} from "../core/contracts/productContribution";
import type {
    RuntimeSessionSnapshot
} from "../runtime/provider-contract/runtimeProvider";


export interface BrowserConsoleBootstrapOptions {
    document: Document;
    productId: string;
    runtimeId: string;
    completionOptions: CompletionModelOptions;
    readRuntimeStatus(): string;
    readRuntimeSnapshot(): RuntimeSessionSnapshot;
    startRuntimeSession(): Promise<RuntimeSessionSnapshot>;
    renderStatus(snapshot: RuntimeSessionSnapshot): void;
    readHistory(scope: ConsoleHistoryScope): Promise<unknown>;
    writeHistory(scope: ConsoleHistoryScope & { history: string[] }): Promise<unknown> | void;
    executeRuntimeMethod(input: {
        method: string;
        params: Record<string, unknown>;
        source: string;
    }): Promise<{ value?: unknown }>;
    executeVisibleCommand(input: {
        text: string;
        source: string;
        outputWidth?: number;
    }): Promise<unknown>;
    buildContextualHelpRequest?: Parameters<typeof createMainConsoleCoordinator>[0]["buildContextualHelpRequest"];
    parseHelpCommand?: Parameters<typeof createMainConsoleCoordinator>[0]["parseHelpCommand"];
    openHelpTopic(input: {
        topic: string;
        package?: string;
        allowSearch?: boolean;
        kind?: "topic" | "home";
        source: string;
    }): void;
    writeClipboardText(text: string): Promise<void> | void;
    appendMessage(text: string, className?: string): void;
    readRestartVersion?(): Promise<string>;
    getWorkingDirectoryPath(): string;
    getHomeDirectoryPath(): string;
    getActiveDatasetName(): string;
    getProductStateChips(): ProductConsoleStateChip[];
    setWorkingDirectoryPaths(path: string, home: string): void;
    readWorkingDirectory(): Promise<{ path?: unknown; home?: unknown }>;
    restartRuntime(action: "clean" | "restore"): Promise<RuntimeSessionSnapshot>;
    refreshWorkspace(): Promise<void>;
}


export interface BrowserConsoleBootstrapResult {
    session: ReturnType<typeof createConsoleSessionState>;
    completionModel: ReturnType<typeof createCompletionModel>;
    commandHistory: ReturnType<typeof createConsoleCommandHistory>;
    coordinator: ReturnType<typeof createMainConsoleCoordinator>;
    toolbar: ReturnType<typeof createConsoleToolbarController>;
}


export const exposeBrowserConsoleHandle = function(
    windowRef: Window,
    handle: unknown
): void {
    (windowRef as unknown as {
        dialogForgeWebConsole?: unknown;
    }).dialogForgeWebConsole = handle;
};


export const createBrowserConsoleBootstrap = async function(
    options: BrowserConsoleBootstrapOptions
): Promise<BrowserConsoleBootstrapResult> {
    const session = createConsoleSessionState(options.readRuntimeStatus);
    const commandHistory = createConsoleCommandHistory({
        maximumItems: 500,
        readHistory: options.readHistory,
        writeHistory: options.writeHistory,
        excludeFromHistory: function(command) {
            return String(command || "").includes("__DIALOGFORGE_DATASET_READY_");
        }
    });
    const completionModel = createCompletionModel(options.completionOptions);

    await commandHistory.load({
        productId: String(options.productId || "base"),
        runtimeId: String(options.runtimeId || "webr")
    });

    const coordinator = createMainConsoleCoordinator({
        document: options.document,
        session,
        completionModel,
        getHistory: function() {
            return commandHistory.getInputHistory();
        },
        getRuntimeSession: options.readRuntimeSnapshot,
        startRuntimeSession: options.startRuntimeSession,
        renderStatus: options.renderStatus,
        recordHistory: function(text) {
            commandHistory.record(text);
        },
        registerCompletionInput: function(text) {
            completionModel.registerCommandInput(text);
        },
        navigateFallbackHistory: function() {
            return;
        },
        executeRuntimeMethod: options.executeRuntimeMethod,
        executeVisibleCommand: options.executeVisibleCommand,
        buildContextualHelpRequest: options.buildContextualHelpRequest,
        parseHelpCommand: options.parseHelpCommand,
        openHelpTopic: options.openHelpTopic,
        writeClipboardText: options.writeClipboardText
    });
    const toolbar = createConsoleToolbarController({
        document: options.document,
        getRuntimeSession: options.readRuntimeSnapshot,
        isRuntimeBusy: session.isRuntimeBusy,
        getWorkingDirectoryPath: options.getWorkingDirectoryPath,
        getHomeDirectoryPath: options.getHomeDirectoryPath,
        getActiveDatasetName: options.getActiveDatasetName,
        getProductStateChips: options.getProductStateChips,
        translate: function(key) {
            return String(key || "");
        },
        setWorkingDirectoryPaths: options.setWorkingDirectoryPaths,
        readWorkingDirectory: options.readWorkingDirectory,
        clearTranscriptEvents: function() {
            return;
        },
        clearTranscriptIdentity: session.clearTranscriptIdentity,
        clearConsoleSurface: function() {
            coordinator.clear();
        },
        renderTranscript: function() {
            return;
        },
        setInputText: function(value) {
            coordinator.setText(value);
        },
        focusInput: function() {
            coordinator.focus();
        },
        restartRuntime: options.restartRuntime,
        appendRestartMessage: async function(action, phase, message): Promise<void> {
            if (phase === "starting") {
                options.appendMessage("Restarting R...");
                return;
            }

            if (phase === "completed") {
                const version = String(await options.readRestartVersion?.() || "").trim();

                options.appendMessage(version
                    ? action === "restore"
                        ? `R ${version} restarted and workspace restored.`
                        : `R ${version} restarted.`
                    : message || (
                        action === "restore"
                            ? "R restarted and workspace restored."
                            : "R restarted."
                    )
                );
                return;
            }

            options.appendMessage(
                message || "R restart failed.",
                "web-transcript__line--stderr"
            );
        },
        applyRuntimeSession: function() {
            session.notifySessionPhase();
        },
        refreshRuntimeEvents: function() {
            return;
        },
        refreshPrompts: function() {
            return;
        },
        refreshWorkspace: options.refreshWorkspace
    });

    return {
        session,
        completionModel,
        commandHistory,
        coordinator,
        toolbar
    };
};

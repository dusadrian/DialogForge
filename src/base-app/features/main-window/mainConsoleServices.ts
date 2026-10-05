import type {
    RuntimeSessionSnapshot,
    WorkspaceSnapshot
} from "../../../runtime/provider-contract/runtimeProvider";
import type {
    ConsoleCommandHistory
} from "../../../console/services/consoleCommandHistory";
import type {
    ConsoleSessionState
} from "../../../console/services/consoleSessionState";
import type {
    CompletionModel
} from "../../../console/terminal/completionTypes";
import {
    rDefaultTerminalSymbols
} from "../../../runtime/providers/r/completions/rCompletionDefaults";
import {
    rInternalCompletionSymbolNames
} from "../../../runtime/providers/r/completions/rInternalCompletionSymbols";
import {
    getRCompletionContext
} from "../../../runtime/providers/r/completions/rCompletionContext";
import {
    readRRequestedPackages
} from "../../../runtime/providers/r/completions/rRequestedPackages";
import {
    createRConsoleCompletionReader
} from "../../../runtime/providers/r/completions/rConsoleRuntimeCompletion";
import {
    buildRContextualHelpRequest,
    parseRConsoleHelpCommand
} from "../../../runtime/providers/r/help/rContextualHelp";
import {
    createConsoleServices
} from "../../../console/renderer/consoleServices";


export interface MainConsoleServicesOptions {
    document: Document;
    dialogForge: DialogForgeApi;
    session: ConsoleSessionState;
    getRuntimeSession(): RuntimeSessionSnapshot | null;
    getWorkspaceSnapshot?(): WorkspaceSnapshot | null;
    startRuntimeSession(): Promise<RuntimeSessionSnapshot>;
    renderStatus(snapshot: RuntimeSessionSnapshot): void;
    recordHistory(text: string): void;
    navigateFallbackHistory(direction: number): void;
}

export interface MainConsoleServices {
    completionModel: CompletionModel;
    commandHistory: ConsoleCommandHistory;
    coordinator: ReturnType<typeof createConsoleServices>["coordinator"];
}


export const createMainConsoleServices = function(
    options: MainConsoleServicesOptions
): MainConsoleServices {
    const readConsoleCompletions = createRConsoleCompletionReader({
        source: "base-app.console-input",
        readSession: function() {
            const snapshot = options.getRuntimeSession();
            return snapshot ? { owner: snapshot.providerId, snapshot } : null;
        },
        isRuntimeBusy: () => options.session.isRuntimeBusy(),
        workspaceEntries: () => options.getWorkspaceSnapshot?.()?.objects || [],
        readCompletions: (request) => options.dialogForge.readCompletions(request)
    });

    return createConsoleServices({
        document: options.document,
        session: options.session,
        completion: {
            initialTerminalSymbols: rDefaultTerminalSymbols,
            suppressedTerminalSymbols: [...rInternalCompletionSymbolNames],
            contextParser: getRCompletionContext,
            packageRequestParser: readRRequestedPackages,
            completionFetch: readConsoleCompletions
        },
        history: {
            readHistory: function(scope) {
                return options.dialogForge.readConsoleHistory(scope);
            },
            writeHistory: function(request) {
                return options.dialogForge.writeConsoleHistory(request);
            }
        },
        coordinator: {
            getRuntimeSession: options.getRuntimeSession,
            startRuntimeSession: options.startRuntimeSession,
            renderStatus: options.renderStatus,
            recordHistory: options.recordHistory,
            navigateFallbackHistory: options.navigateFallbackHistory,
            executeRuntimeMethod: options.dialogForge.executeRuntimeMethod,
            executeVisibleCommand: options.dialogForge.executeVisibleCommand,
            buildContextualHelpRequest: buildRContextualHelpRequest,
            parseHelpCommand: parseRConsoleHelpCommand,
            openHelpTopic: function(input): void {
                void options.dialogForge.openHelpTopic(input);
            },
            readClipboardText: async function(): Promise<string> {
                const result = await options.dialogForge.readClipboardText();
                return String(result?.text || "");
            },
            writeClipboardText: options.dialogForge.writeClipboardText
        }
    });
};

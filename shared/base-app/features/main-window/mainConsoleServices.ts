import type {
    RuntimeSessionSnapshot
} from "../../../runtime/provider-contract/runtimeProvider";
import type {
    ConsoleCommandHistory
} from "../../../console/services/consoleCommandHistory";
import {
    createConsoleCommandHistory
} from "../../../console/services/consoleCommandHistory";
import type {
    ConsoleSessionState
} from "../../../console/services/consoleSessionState";
import type {
    CompletionModel
} from "../../../console/terminal/completionTypes";
import {
    createCompletionModel
} from "../../../console/terminal/completionModel";
import {
    createMainConsoleCoordinator
} from "../../../console/renderer/mainConsoleCoordinator";


export interface MainConsoleServicesOptions {
    document: Document;
    dialogForge: DialogForgeApi;
    session: ConsoleSessionState;
    getRuntimeSession(): RuntimeSessionSnapshot | null;
    startRuntimeSession(): Promise<RuntimeSessionSnapshot>;
    renderStatus(snapshot: RuntimeSessionSnapshot): void;
    recordHistory(text: string): void;
    navigateFallbackHistory(direction: number): void;
}

export interface MainConsoleServices {
    completionModel: CompletionModel;
    commandHistory: ConsoleCommandHistory;
    coordinator: ReturnType<typeof createMainConsoleCoordinator>;
}


export const createMainConsoleServices = function(
    options: MainConsoleServicesOptions
): MainConsoleServices {
    const completionModel = createCompletionModel({
        completionFetch: async function(params, timeoutMs) {
            const result = await options.dialogForge.readCompletions({
                prefix: String(params.prefix || ""),
                code: String(params.code || ""),
                cursorColumn: params.cursorColumn,
                timeoutMs,
                packageName: String(params.packageName || ""),
                includeInternals: params.includeInternals === true,
                source: "base-app.console-input"
            });

            return {
                ok: result.status === "ready",
                value: result
            };
        }
    });

    const commandHistory = createConsoleCommandHistory({
        maximumItems: 500,
        readHistory: function(scope) {
            return options.dialogForge.readConsoleHistory(scope);
        },
        writeHistory: function(request) {
            return options.dialogForge.writeConsoleHistory(request);
        },
        registerCompletionInput: function(command) {
            completionModel.registerCommandInput(command);
        },
        excludeFromHistory: function(command) {
            return command.includes("__DIALOGFORGE_DATASET_READY_");
        }
    });

    const coordinator = createMainConsoleCoordinator({
        document: options.document,
        session: options.session,
        completionModel,
        getHistory: function() {
            return commandHistory.getInputHistory();
        },
        getRuntimeSession: options.getRuntimeSession,
        startRuntimeSession: options.startRuntimeSession,
        renderStatus: options.renderStatus,
        recordHistory: options.recordHistory,
        registerCompletionInput: function(text): void {
            completionModel.registerCommandInput(text);
        },
        navigateFallbackHistory: options.navigateFallbackHistory,
        executeRuntimeMethod: options.dialogForge.executeRuntimeMethod,
        executeVisibleCommand: options.dialogForge.executeVisibleCommand,
        openHelpTopic: function(input): void {
            void options.dialogForge.openHelpTopic(input);
        }
    });

    return {
        completionModel,
        commandHistory,
        coordinator
    };
};

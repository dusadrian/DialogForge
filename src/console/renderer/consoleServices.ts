import type {
    ConsoleCommandHistoryOptions
} from "../services/consoleCommandHistory";
import {
    createConsoleCommandHistory
} from "../services/consoleCommandHistory";
import type {
    ConsoleSessionState
} from "../services/consoleSessionState";
import type {
    CompletionModelOptions
} from "../terminal/completionTypes";
import {
    createCompletionModel
} from "../terminal/completionModel";
import type {
    MainConsoleCoordinatorBindings
} from "./mainConsoleCoordinator";
import {
    createMainConsoleCoordinator
} from "./mainConsoleCoordinator";


type ConsoleCoordinatorOptions = Omit<
    MainConsoleCoordinatorBindings,
    | "document"
    | "session"
    | "completionModel"
    | "getHistory"
    | "recordHistory"
    | "registerCompletionInput"
> & {
    recordHistory?(text: string): void;
};


export interface ConsoleServicesOptions {
    document: Document;
    session: ConsoleSessionState;
    completion: CompletionModelOptions;
    history: Omit<
        ConsoleCommandHistoryOptions,
        "registerCompletionInput"
    >;
    coordinator: ConsoleCoordinatorOptions;
}


export const createConsoleServices = function(
    options: ConsoleServicesOptions
) {
    const completionModel = createCompletionModel(options.completion);
    const commandHistory = createConsoleCommandHistory({
        ...options.history,
        registerCompletionInput: function(command) {
            completionModel.registerCommandInput(command);
        }
    });
    const coordinator = createMainConsoleCoordinator({
        ...options.coordinator,
        document: options.document,
        session: options.session,
        completionModel,
        getHistory: function() {
            return commandHistory.getInputHistory();
        },
        recordHistory: options.coordinator.recordHistory
            || commandHistory.record,
        registerCompletionInput: function(text): void {
            completionModel.registerCommandInput(text);
        }
    });

    return {
        completionModel,
        commandHistory,
        coordinator
    };
};

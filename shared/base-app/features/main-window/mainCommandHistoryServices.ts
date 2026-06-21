import type {
    EvaluatedMenuItem
} from "../../../core/contracts/applicationComposition";
import {
    compositionPanelsApi
} from "../composition-panels/compositionPanels";
import {
    createMainCommandHistoryController
} from "../menu-commands/mainCommandHistoryController";


export interface MainCommandHistoryServicesOptions {
    document: Document;
    commandLog: HTMLElement;
    appendCommandField(
        parent: HTMLElement,
        name: string,
        value: unknown
    ): void;
    empty(element: HTMLElement): void;
    setStatusClass(element: HTMLElement, enabled: boolean): void;
    renderSelectedCommand(command: EvaluatedMenuItem): void;
    recordConsoleHistory(text: string): void;
    navigateConsoleHistory(direction: number): {
        changed: boolean;
        value: string;
    };
    navigateConsoleSurfaceHistory(direction: number): boolean;
    setVisibleCommandText(value: string): void;
}


export const createMainCommandHistoryServices = function(
    options: MainCommandHistoryServicesOptions
) {
    const renderCommandHistory = function(
        commands: EvaluatedMenuItem[]
    ): void {
        compositionPanelsApi.renderCommandHistory(
            options.document,
            options.commandLog,
            commands,
            {
                appendField: options.appendCommandField,
                empty: options.empty,
                setStatusClass: options.setStatusClass
            }
        );
    };
    const commandHistoryController = createMainCommandHistoryController({
        renderSelectedCommand: options.renderSelectedCommand,
        renderCommandHistory
    });

    const recordVisibleCommandHistory = function(text: string): void {
        options.recordConsoleHistory(text);
    };

    const navigateVisibleCommandHistory = function(
        direction: number
    ): void {
        if (options.navigateConsoleSurfaceHistory(direction)) {
            return;
        }

        const navigation = options.navigateConsoleHistory(direction);

        if (navigation.changed) {
            options.setVisibleCommandText(navigation.value);
        }
    };

    return {
        recordCommand: commandHistoryController.record,
        recordVisibleCommandHistory,
        navigateVisibleCommandHistory
    };
};

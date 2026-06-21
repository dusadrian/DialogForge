import type {
    EvaluatedMenuItem
} from "../../../core/contracts/applicationComposition";


export interface MainCommandHistoryControllerBindings {
    renderSelectedCommand(command: EvaluatedMenuItem): void;
    renderCommandHistory(commands: EvaluatedMenuItem[]): void;
}


export interface MainCommandHistoryController {
    record(command: EvaluatedMenuItem): void;
}


export const createMainCommandHistoryController = function(
    bindings: MainCommandHistoryControllerBindings
): MainCommandHistoryController {
    const commands: EvaluatedMenuItem[] = [];

    const record = function(command: EvaluatedMenuItem): void {
        commands.unshift(command);

        if (commands.length > 8) {
            commands.pop();
        }

        bindings.renderSelectedCommand(command);
        bindings.renderCommandHistory(commands);

    };

    return {
        record
    };
};

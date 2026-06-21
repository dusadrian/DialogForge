import type {
    EvaluatedMenuItem
} from "../../../core/contracts/applicationComposition";


export interface MainCommandHistoryControllerBindings {
    renderSelectedCommand(command: EvaluatedMenuItem): void;
    renderCommandHistory(commands: EvaluatedMenuItem[]): void;
    renderDialogHost(command: EvaluatedMenuItem): void;
    closeDialogHost(): void;
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

        if (
            command.type === "shared-dialog"
            || command.type === "product-dialog"
        ) {
            bindings.renderDialogHost(command);
            return;
        }

        bindings.closeDialogHost();
    };

    return {
        record
    };
};

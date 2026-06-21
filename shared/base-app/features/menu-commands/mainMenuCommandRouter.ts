import type {
    EvaluatedMenuItem
} from "../../../core/contracts/applicationComposition";


export interface MainMenuCommandBindings {
    recordCommand(command: EvaluatedMenuItem): void;
    startRuntime(): void;
    stopRuntime(): void;
    refreshWorkspace(): void;
    openWorkspaceFile(): void;
    saveWorkspaceFile(): void;
    setWorkingDirectory(): void;
    openScriptFile(): void;
    focusScriptEditor(): void;
    showSettings(): void;
    showProductInfo(): void;
    openDeveloperDiagnostics(): void;
    runScriptFile(): void;
    executeDatasetCommand(command: string): void;
    openDialog(dialogId: string): void;
    executeProductCommand(command: EvaluatedMenuItem): Promise<void>;
    activateFeature(command: EvaluatedMenuItem): void;
}


const routeShellCommand = function(
    command: EvaluatedMenuItem,
    bindings: MainMenuCommandBindings
): void {
    if (command.command === "runtime.start") {
        bindings.startRuntime();
        return;
    }

    if (command.command === "runtime.stop") {
        bindings.stopRuntime();
        return;
    }

    if (command.command === "workspace.refresh") {
        bindings.refreshWorkspace();
        return;
    }

    if (command.command === "workspace.openFile") {
        bindings.openWorkspaceFile();
        return;
    }

    if (command.command === "workspace.saveFile") {
        bindings.saveWorkspaceFile();
        return;
    }

    if (command.command === "runtime.setWorkingDirectory") {
        bindings.setWorkingDirectory();
        return;
    }

    if (command.command === "script.openFile") {
        bindings.openScriptFile();
        return;
    }

    if (command.command === "script.focusEditor") {
        bindings.focusScriptEditor();
        return;
    }

    if (command.command === "app.showSettings") {
        bindings.showSettings();
        return;
    }

    if (command.command === "app.showProductInfo") {
        bindings.showProductInfo();
        return;
    }

    if (command.command === "app.openDevDiagnostics") {
        bindings.openDeveloperDiagnostics();
        return;
    }

    if (command.command === "runtime.runScriptFile") {
        bindings.runScriptFile();
        return;
    }

    const shellCommand = String(command.command || "");

    if (shellCommand.startsWith("dataset.")) {
        bindings.executeDatasetCommand(shellCommand);
    }
};


export const createMainMenuCommandHandler = function(
    bindings: MainMenuCommandBindings
): (command: EvaluatedMenuItem) => void {
    return function(command: EvaluatedMenuItem): void {
        bindings.recordCommand(command);

        if (command.type === "shell-command") {
            routeShellCommand(command, bindings);
            return;
        }

        if (
            command.type === "shared-dialog"
            || command.type === "product-dialog"
        ) {
            bindings.openDialog(command.dialog || "");
            return;
        }

        if (command.type === "product-command") {
            void bindings.executeProductCommand(command).catch((error) => {
                console.error(error);
            });
            return;
        }

        if (command.type === "feature") {
            bindings.activateFeature(command);
        }
    };
};

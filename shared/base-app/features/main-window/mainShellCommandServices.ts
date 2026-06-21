import type {
    EvaluatedMenuItem
} from "../../../core/contracts/applicationComposition";
import type {
    OpenFileResult
} from "../../../shell-electron/filesystem/openFileResult";
import {
    createMainFileDropController
} from "../file-drop/mainFileDropController";
import {
    createMainMenuCommandHandler
} from "../menu-commands/mainMenuCommandRouter";


export interface MainShellCommandServicesOptions {
    dialogForge: DialogForgeApi;
    recordCommand(command: EvaluatedMenuItem): void;
    startRuntime(): void;
    stopRuntime(): void;
    refreshWorkspace(): Promise<void>;
    openWorkspaceFile(): void;
    saveWorkspaceFile(): void;
    setWorkingDirectory(): void;
    openScriptFile(): void;
    runScriptFile(): void;
    executeDatasetCommand(command: string): void;
    executeProductCommand(command: EvaluatedMenuItem): Promise<void>;
    executeVisibleCommandText(command: string, source: string): Promise<void>;
    renderFeatureEntrypointActivation(command: EvaluatedMenuItem): void;
    renderRuntimeResult(result: { status: string; message?: string }): void;
    refreshWorkingDirectory(): Promise<void>;
    openScriptFilePath(filePath: string): Promise<unknown>;
    applyImportFile(result: OpenFileResult): void;
}


export const createMainShellCommandServices = function(
    options: MainShellCommandServicesOptions
) {
    const fileDropController = createMainFileDropController({
        renderRuntimeResult: options.renderRuntimeResult,
        refreshWorkingDirectory: options.refreshWorkingDirectory,
        refreshWorkspace: options.refreshWorkspace,
        openScriptFile: options.openScriptFilePath,
        applyImportFile: options.applyImportFile
    });
    const handleMenuCommand = createMainMenuCommandHandler({
        recordCommand: options.recordCommand,
        startRuntime: options.startRuntime,
        stopRuntime: options.stopRuntime,
        refreshWorkspace: function(): void {
            void options.refreshWorkspace();
        },
        openWorkspaceFile: options.openWorkspaceFile,
        saveWorkspaceFile: options.saveWorkspaceFile,
        setWorkingDirectory: options.setWorkingDirectory,
        openScriptFile: options.openScriptFile,
        focusScriptEditor: function(): void {
            options.dialogForge.openScriptEditor();
        },
        showSettings: function(): void {
            void options.dialogForge.openSettingsWindow();
        },
        showProductInfo: function(): void {
            void options.dialogForge.openAboutWindow();
        },
        openDeveloperDiagnostics: function(): void {
            options.dialogForge.openDevDiagnostics();
        },
        runScriptFile: options.runScriptFile,
        executeDatasetCommand: options.executeDatasetCommand,
        openDialog: function(dialogId): void {
            void options.dialogForge.openProductDialog(dialogId);
        },
        executeProductCommand: async function(command): Promise<void> {
            try {
                await options.executeProductCommand(command);
            } catch (error) {
                const message = error instanceof Error
                    ? error.message
                    : String(error || "Product command failed.");

                await options.executeVisibleCommandText(
                    `message(${JSON.stringify(message)})`,
                    "base-app.product-command.error"
                );
            }
        },
        activateFeature: options.renderFeatureEntrypointActivation
    });

    return {
        bindFileDropHandling: fileDropController.bind,
        handleMenuCommand
    };
};

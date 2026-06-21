import type {
    ProductPackageSourcePolicy
} from "../../../core/contracts/applicationComposition";
import type {
    RuntimeExtensionMethodResult
} from "../../../runtime/provider-contract/runtimeProvider";
import {
    createRPackageInstallWorkflow
} from "../../../runtime/providers/r/dependencies/packageInstallWorkflow";
import {
    createRuntimeFileWorkflow
} from "../../../runtime/providers/r/files/runtimeFileWorkflow";
import type {
    OpenFileResult
} from "../../../shell-electron/filesystem/openFileResult";


export interface MainRuntimeWorkflowOptions {
    dialogForge: DialogForgeApi;
    getProductId(): string;
    getPackageSourcePolicy(): ProductPackageSourcePolicy;
    executeVisibleCommand(command: string, source: string): Promise<void>;
    renderImportFileResult(result: OpenFileResult): void;
    renderRuntimeMethodResult(result: RuntimeExtensionMethodResult): void;
    refreshConsoleWorkingDirectory(): Promise<void>;
    refreshWorkspace(): Promise<void> | void;
}

export interface MainRuntimeWorkflows {
    packageInstallWorkflow: ReturnType<typeof createRPackageInstallWorkflow>;
    runtimeFileWorkflow: ReturnType<typeof createRuntimeFileWorkflow<
        OpenFileResult,
        RuntimeExtensionMethodResult
    >>;
}


export const createMainRuntimeWorkflows = function(
    options: MainRuntimeWorkflowOptions
): MainRuntimeWorkflows {
    const packageInstallWorkflow = createRPackageInstallWorkflow({
        getProductId: options.getProductId,
        getPackageSourcePolicy: options.getPackageSourcePolicy,
        executeQuery: function(query, source) {
            return options.dialogForge.executeInvisibleQuery({
                query,
                source
            });
        },
        chooseLibrary: function(input) {
            return options.dialogForge.choosePackageInstallLibrary(input);
        },
        confirmRestart: function(packages) {
            return options.dialogForge.confirmPackageRestart(packages);
        },
        restartRuntime: function(action) {
            return options.dialogForge.restartRuntimeForPackages(action);
        },
        executeVisibleCommand: options.executeVisibleCommand
    });

    const runtimeFileWorkflow = createRuntimeFileWorkflow<
        OpenFileResult,
        RuntimeExtensionMethodResult
    >({
        selectWorkingDirectory: function() {
            return options.dialogForge.selectWorkingDirectory();
        },
        selectScriptFile: function() {
            return options.dialogForge.selectScriptFile();
        },
        selectWorkspaceOpenFile: function() {
            return options.dialogForge.selectWorkspaceOpenFile();
        },
        selectWorkspaceSaveFile: function() {
            return options.dialogForge.selectWorkspaceSaveFile();
        },
        execute: function(input) {
            return options.dialogForge.executeRuntimeMethod(input);
        },
        selectionCanceled: options.renderImportFileResult,
        executionFinished: options.renderRuntimeMethodResult,
        refreshWorkingDirectory: options.refreshConsoleWorkingDirectory,
        refreshWorkspace: options.refreshWorkspace
    });

    return {
        packageInstallWorkflow,
        runtimeFileWorkflow
    };
};

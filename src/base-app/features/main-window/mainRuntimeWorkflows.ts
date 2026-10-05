import type {
    ProductPackageSourcePolicy
} from "../../../core/contracts/applicationComposition";
import type {
    RuntimeExtensionMethodResult,
    RuntimeSessionSnapshot
} from "../../../runtime/provider-contract/runtimeProvider";
import {
    createRuntimePackageInstallWorkflow,
    type RuntimePackageInstallWorkflow
} from "../../../runtime/dependencies/runtimePackageInstallWorkflow";
import {
    createRuntimeFileWorkflow
} from "../../../runtime/files/runtimeFileWorkflow";
import type {
    OpenFileResult
} from "../files/openFileResult";
import type { RuntimeCommandResult } from "../../../runtime/commands/runtimeCommandReceipt";


export interface MainRuntimeWorkflowOptions {
    dialogForge: DialogForgeApi;
    getRuntimeSnapshot?(): RuntimeSessionSnapshot | null;
    getRuntimeProviderId(): string;
    getProductId(): string;
    getPackageSourcePolicy(): ProductPackageSourcePolicy;
    executeVisibleCommand(command: string, source: string): Promise<RuntimeCommandResult>;
    renderImportFileResult(result: OpenFileResult): void;
    renderRuntimeMethodResult(result: RuntimeExtensionMethodResult): void;
    refreshConsoleWorkingDirectory(): Promise<void>;
    refreshWorkspace(): Promise<void> | void;
}

export interface MainRuntimeWorkflows {
    packageInstallWorkflow: RuntimePackageInstallWorkflow;
    runtimeFileWorkflow: ReturnType<typeof createRuntimeFileWorkflow<
        OpenFileResult,
        RuntimeExtensionMethodResult
    >>;
}


export const createMainRuntimeWorkflows = function(
    options: MainRuntimeWorkflowOptions
): MainRuntimeWorkflows {
    const packageInstallWorkflow = createRuntimePackageInstallWorkflow({
        getRuntimeSnapshot: options.getRuntimeSnapshot,
        getRuntimeProviderId: options.getRuntimeProviderId,
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

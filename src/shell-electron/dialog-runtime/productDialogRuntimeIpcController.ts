import type {
    IpcMain,
    IpcMainEvent,
    IpcMainInvokeEvent
} from "electron";

import { createDialogExecutionRequest } from "../../runtime/dialogs/dialogExecutionProtocol";
import { createRuntimeExtensionMethodRequest } from "../../runtime/extensions/runtimeExtensionProtocol";
import { createInvisibleQueryRequest } from "../../runtime/queries/invisibleQueryProtocol";
import type {
    DialogExecutionRequest,
    RuntimeSessionManager,
    VisibleCommandRequest
} from "../../runtime/provider-contract/runtimeProvider";
import type { RuntimeCommandResult } from "../../runtime/commands/runtimeCommandReceipt";
import type {
    ImportPreviewRequest
} from "../../runtime/tabular-data/importPreview";
import {
    createDialogVariableValuesResult
} from "../../runtime/tabular-data/dialogVariableValues";
import {
    createDialogImportFileResult,
    dialogRuntimeEventChannels,
    dialogRuntimeIpcChannels,
    type ProductDialogCommandPayload
} from "../../dialog-runtime/dialogRuntimeIpc";
import {
    createProductDialogCommandSource,
    executeProductDialogCommand,
    type ProductDialogCommandDependencyResult
} from "../../dialog-runtime/dialogCommandExecution";


export type ProductDialogRuntimeDependencyResult = ProductDialogCommandDependencyResult;


export interface ProductDialogRuntimeIpcControllerOptions {
    ipcMain: IpcMain;
    runtimeSessionManager: Pick<
        RuntimeSessionManager,
        "executeDialog" | "executeInvisibleQuery" | "executeRuntimeMethod"
    >;
    getProductId(): string;
    openImportFile(): Promise<unknown>;
    previewImportFile(
        input: Partial<ImportPreviewRequest>
    ): Promise<unknown>;
    ensureDependencies(
        dependencies: unknown,
        rPackageRequirements: unknown,
        source: string
    ): Promise<ProductDialogRuntimeDependencyResult>;
    executeVisibleCommand(request: VisibleCommandRequest): Promise<RuntimeCommandResult>;
    broadcastRuntimeEvents(): Promise<void>;
    reportError(error: unknown): void;
}


interface ProductDialogVariableValuesPayload {
    name?: string;
    variableName?: string;
}


interface ProductDialogCreatedPayload {
    name?: string;
    dialogID?: string;
    dependencies?: unknown;
    rPackageRequirements?: unknown;
}


export const createProductDialogRuntimeIpcController = function(
    options: ProductDialogRuntimeIpcControllerOptions
): void {
    const executeCommand = function(
        payload: ProductDialogCommandPayload,
        reportDependencyFailure?: (error: string) => void
    ) {
        return executeProductDialogCommand(payload, {
            getProductId: () => options.getProductId(),
            prepareDependencies: (input, source) => options.ensureDependencies(
                input.dependencies, input.rPackageRequirements, source
            ),
            executeVisibleCommand: (request) => options.executeVisibleCommand(request),
            reportDependencyFailure
        });
    };

    options.ipcMain.on(dialogRuntimeEventChannels.created, (
        _event: IpcMainEvent,
        payload: ProductDialogCreatedPayload
    ) => {
        const dialogId = String(
            payload?.dialogID || payload?.name || "unknown"
        );
        const source = createProductDialogCommandSource(
            options.getProductId(),
            dialogId
        );

        void options.ensureDependencies(
            payload?.dependencies,
            payload?.rPackageRequirements,
            source
        ).then((result) => {
            if (!result.ok) {
                options.reportError(result.error);
            }
        }).catch(options.reportError);
    });

    options.ipcMain.handle(dialogRuntimeIpcChannels.executeDialog, async (
        _event: IpcMainInvokeEvent,
        input: Partial<DialogExecutionRequest>
    ) => {
        const request = createDialogExecutionRequest(input || {});
        const result = await options.runtimeSessionManager.executeDialog(request);

        if (result.status === "planned") {
            await options.broadcastRuntimeEvents();
        }

        return result;
    });

    options.ipcMain.handle(dialogRuntimeIpcChannels.openImportFile, async () => {
        return createDialogImportFileResult(
            await options.openImportFile()
        );
    });

    options.ipcMain.handle(dialogRuntimeIpcChannels.previewImportFile, async (
        _event: IpcMainInvokeEvent,
        input: Partial<ImportPreviewRequest>
    ) => {
        return options.previewImportFile(input || {});
    });

    options.ipcMain.on(dialogRuntimeEventChannels.runCommand, (
        _event: IpcMainEvent,
        payload: ProductDialogCommandPayload
    ) => {
        void executeCommand(payload, (error) => options.reportError(error))
            .catch((error) => options.reportError(error));
    });

    options.ipcMain.handle(dialogRuntimeIpcChannels.getWorkingDirectory, async () => {
        const productId = options.getProductId();
        const result = await options.runtimeSessionManager.executeInvisibleQuery(
            createInvisibleQueryRequest({
                query: "getwd()",
                source: `${productId}.dialog`
            })
        );

        return String(result.value || "");
    });

    options.ipcMain.handle(dialogRuntimeIpcChannels.runVisibleCommand, async (
        _event: IpcMainInvokeEvent,
        payload: ProductDialogCommandPayload
    ) => {
        return executeCommand(payload);
    });

    options.ipcMain.handle(dialogRuntimeIpcChannels.getVariableValues, async (
        _event: IpcMainInvokeEvent,
        payload: ProductDialogVariableValuesPayload
    ) => {
        const dataset = String(payload?.name || "").trim();
        const variable = String(payload?.variableName || "").trim();

        if (!dataset || !variable) {
            return createDialogVariableValuesResult(null, {
                name: dataset,
                variableName: variable
            });
        }

        const productId = options.getProductId();
        const result = await options.runtimeSessionManager.executeRuntimeMethod(
            createRuntimeExtensionMethodRequest({
                method: "workspace.dataset_values",
                params: {
                    name: dataset,
                    variableName: variable
                },
                source: `${productId}.dialog.variableValues`
            })
        );

        if (result.status !== "ready") {
            return createDialogVariableValuesResult(null, {
                name: dataset,
                variableName: variable,
                error: result.message || "Unable to read variable values."
            });
        }

        return createDialogVariableValuesResult(result.value, {
            name: dataset,
            variableName: variable
        });
    });
};

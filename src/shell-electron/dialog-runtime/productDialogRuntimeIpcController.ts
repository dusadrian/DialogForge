import type {
    IpcMain,
    IpcMainEvent,
    IpcMainInvokeEvent
} from "electron";

import { createVisibleCommandRequest } from "../../runtime/commands/commandProtocol";
import { createDialogExecutionRequest } from "../../runtime/dialogs/dialogExecutionProtocol";
import { createRuntimeExtensionMethodRequest } from "../../runtime/extensions/runtimeExtensionProtocol";
import { createInvisibleQueryRequest } from "../../runtime/queries/invisibleQueryProtocol";
import type {
    DialogExecutionRequest,
    RuntimeSessionManager,
    TranscriptEvent,
    VisibleCommandRequest
} from "../../runtime/provider-contract/runtimeProvider";
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
    createEmptyProductDialogCommandResult,
    createProductDialogCommandResultFromEvents,
    readProductDialogCommandText
} from "../../dialog-runtime/dialogCommandResult";


export interface ProductDialogRuntimeDependencyResult {
    ok: boolean;
    error: string;
    status?: string;
}


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
    executeVisibleCommand(request: VisibleCommandRequest): Promise<TranscriptEvent[]>;
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


const createDialogSource = function(
    productId: string,
    dialogId: unknown
): string {
    return `${productId}.dialog.${String(dialogId || "unknown")}`;
};


export const createProductDialogRuntimeIpcController = function(
    options: ProductDialogRuntimeIpcControllerOptions
): void {
    options.ipcMain.on(dialogRuntimeEventChannels.created, (
        _event: IpcMainEvent,
        payload: ProductDialogCreatedPayload
    ) => {
        const dialogId = String(
            payload?.dialogID || payload?.name || "unknown"
        );
        const source = createDialogSource(
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
        const command = String(payload?.command || "").trim();

        if (!command) {
            return;
        }

        const source = createDialogSource(
            options.getProductId(),
            payload?.dialogID
        );

        void (async () => {
            const dependencyResult = await options.ensureDependencies(
                payload?.dependencies,
                payload?.rPackageRequirements,
                source
            );

            if (!dependencyResult.ok) {
                options.reportError(dependencyResult.error);
                return;
            }

            await options.executeVisibleCommand(createVisibleCommandRequest({
                text: command,
                source
            }));
        })().catch(options.reportError);
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
        const command = readProductDialogCommandText(payload);

        if (!command) {
            return createEmptyProductDialogCommandResult(command);
        }

        const source = createDialogSource(
            options.getProductId(),
            payload?.dialogID
        );
        const dependencyResult = await options.ensureDependencies(
            payload?.dependencies,
            payload?.rPackageRequirements,
            source
        );

        if (!dependencyResult.ok) {
            return {
                ok: false,
                status: dependencyResult.status || "error",
                printed: "",
                error: dependencyResult.error,
                command
            };
        }

        const events = await options.executeVisibleCommand(
            createVisibleCommandRequest({
                text: command,
                source
            })
        );

        return createProductDialogCommandResultFromEvents(command, events);
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

import type {
    IpcMain,
    IpcMainEvent,
    IpcMainInvokeEvent
} from "electron";

import { createVisibleCommandRequest } from "../../runtime/commands/commandProtocol";
import { createDialogExecutionRequest } from "../../runtime/dialogs/dialogExecutionProtocol";
import { createInvisibleQueryRequest } from "../../runtime/queries/invisibleQueryProtocol";
import type {
    DialogExecutionRequest,
    RuntimeSessionManager,
    TranscriptEvent,
    VisibleCommandRequest
} from "../../runtime/provider-contract/runtimeProvider";
import {
    dialogRuntimeEventChannels,
    dialogRuntimeIpcChannels,
    type ProductDialogCommandPayload
} from "../dialogRuntimeIpc";


export interface ProductDialogRuntimeDependencyResult {
    ok: boolean;
    error: string;
}


export interface ProductDialogRuntimeIpcControllerOptions {
    ipcMain: IpcMain;
    runtimeSessionManager: Pick<
        RuntimeSessionManager,
        "executeDialog" | "executeInvisibleQuery"
    >;
    getProductId(): string;
    ensureDependencies(
        dependencies: unknown,
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


const createDialogSource = function(
    productId: string,
    dialogId: unknown
): string {
    return `${productId}.dialog.${String(dialogId || "unknown")}`;
};


export const createProductDialogRuntimeIpcController = function(
    options: ProductDialogRuntimeIpcControllerOptions
): void {
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
        const command = String(payload?.command || "").trim();

        if (!command) {
            return {
                ok: false,
                status: "error",
                printed: "",
                error: "Command is empty.",
                command
            };
        }

        const source = createDialogSource(
            options.getProductId(),
            payload?.dialogID
        );
        const dependencyResult = await options.ensureDependencies(
            payload?.dependencies,
            source
        );

        if (!dependencyResult.ok) {
            return {
                ok: false,
                status: "error",
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
        const errorEvent = events.find((event) => {
            return event.type === "error" || event.type === "rejected";
        });
        const printed = events.filter((event) => {
            return event.type === "output" && Boolean(event.message);
        }).map((event) => {
            return String(event.message);
        }).join("\n");

        return errorEvent
            ? {
                ok: false,
                status: "error",
                printed,
                error: String(errorEvent.message || "Dialog command failed."),
                command,
                events
            }
            : {
                ok: true,
                status: "ok",
                printed,
                error: "",
                command,
                events
            };
    });

    options.ipcMain.handle(dialogRuntimeIpcChannels.getVariableValues, async (
        _event: IpcMainInvokeEvent,
        payload: ProductDialogVariableValuesPayload
    ) => {
        const dataset = String(payload?.name || "").trim();
        const variable = String(payload?.variableName || "").trim();

        if (!dataset || !variable) {
            return [];
        }

        const query =
            `as.character(get(${JSON.stringify(dataset)}, envir = .GlobalEnv)` +
            `[[${JSON.stringify(variable)}]])`;
        const productId = options.getProductId();
        const result = await options.runtimeSessionManager.executeInvisibleQuery(
            createInvisibleQueryRequest({
                query,
                source: `${productId}.dialog.variableValues`
            })
        );

        return Array.isArray(result.value) ? result.value : [];
    });
};

import type {
    DialogExternalCallResult
} from "../core/contracts/dialogExternalCall";
import type {
    DialogExecutionRequest,
    DialogExecutionResult,
    TranscriptEvent
} from "../runtime/provider-contract/runtimeProvider";
import type {
    ImportPreviewRequest,
    ImportPreviewResult
} from "../runtime/tabular-data/importPreview";
import {
    invokeTypedIpcRoute,
    type IpcInvokeTransport
} from "../core/ipc/typedIpc";
import type {
    ProductConsoleStateChip
} from "../core/contracts/productContribution";


export interface ProductDialogCommandPayload {
    command?: string;
    dialogID?: string;
    dependencies?: unknown;
}


export interface ProductDialogCommandResult {
    ok: boolean;
    status: string;
    printed: string;
    error: string;
    command: string;
    events?: TranscriptEvent[];
}


export interface DialogImportFileResult {
    ok: boolean;
    filePath: string;
    cancelled: boolean;
    message: string;
}


export const createDialogImportFileResult = function(
    value: unknown
): DialogImportFileResult {
    const result = value && typeof value === "object"
        ? value as Record<string, unknown>
        : {};
    const filePath = String(result.filePath || "");

    return {
        ok: result.status === "selected" && Boolean(filePath),
        filePath,
        cancelled: Boolean(result.canceled),
        message: String(result.message || "")
    };
};


export const dialogRuntimeIpcChannels = {
    callExternal: "base-app:callDialogExternal",
    readConsoleStateChips: "base-app:readConsoleStateChips",
    executeDialog: "base-app:executeDialog",
    openProductDialog: "base-app:openProductDialog",
    openImportFile: "dialog:openImportFile",
    previewImportFile: "dialog:previewImportFile",
    getWorkingDirectory: "dialog:getWorkingDirectory",
    runVisibleCommand: "dialog:runVisibleCommand",
    getVariableValues: "dialog:getVariableValues"
} as const;


export const dialogRuntimeEventChannels = {
    browserReady: "dialogRuntime:ready",
    runCommand: "runCommand",
    commandUpdate: "dialogCommandUpdate",
    stateUpdate: "dialogCurrentStateUpdate",
    closeWindow: "dialogCloseWindow",
    created: "dialogCreated",
    incomingData: "dialogIncomingData",
    requirementsLoaded: "base-app:dialog-runtime-requirements-loaded",
    requirementsSaved: "base-app:dialog-runtime-requirements-saved"
} as const;


interface DialogRuntimeIpcRoutes {
    "base-app:callDialogExternal": { input: [string, Record<string, unknown>?]; result: DialogExternalCallResult };
    "base-app:readConsoleStateChips": { input: [string]; result: ProductConsoleStateChip[] };
    "base-app:executeDialog": { input: [Partial<DialogExecutionRequest>]; result: DialogExecutionResult };
    "base-app:openProductDialog": { input: [{ dialogId?: string }]; result: { status: string; dialogId: string } };
    "dialog:openImportFile": { input: []; result: DialogImportFileResult };
    "dialog:previewImportFile": { input: [Partial<ImportPreviewRequest>]; result: ImportPreviewResult };
    "dialog:getWorkingDirectory": { input: []; result: string };
    "dialog:runVisibleCommand": { input: [ProductDialogCommandPayload]; result: ProductDialogCommandResult };
    "dialog:getVariableValues": { input: [{ name?: string; variableName?: string }]; result: unknown };
}


export const invokeDialogRuntimeRoute = function<
    Channel extends keyof DialogRuntimeIpcRoutes & string
>(
    transport: IpcInvokeTransport,
    channel: Channel,
    ...args: DialogRuntimeIpcRoutes[Channel]["input"]
): Promise<DialogRuntimeIpcRoutes[Channel]["result"]> {
    return invokeTypedIpcRoute<
        DialogRuntimeIpcRoutes[Channel]["input"],
        DialogRuntimeIpcRoutes[Channel]["result"]
    >(transport, channel, ...args);
};

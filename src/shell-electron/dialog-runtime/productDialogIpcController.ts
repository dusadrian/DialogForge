import type {
    IpcMain,
    IpcMainEvent,
    IpcMainInvokeEvent
} from "electron";

import type {
    ProductDialogEventController,
    ProductDialogStateUpdate,
    ProductDialogCloseRequest
} from "../../dialog-runtime/dialog-builder/productDialogEventController";
import {
    dialogRuntimeEventChannels,
    dialogRuntimeIpcChannels
} from "../../dialog-runtime/dialogRuntimeIpc";
import type {
    ProductDialogOpenReadiness
} from "./productDialogWindowController";


export interface ProductDialogIpcWindowController {
    open(dialogId: string): unknown;
    prepareOpen(dialogId: string): Promise<ProductDialogOpenReadiness>;
}


export interface ProductDialogMessageRequest {
    type: "info" | "warning" | "error" | "question";
    message: string;
    detail: string;
}


export interface ProductDialogIpcControllerOptions {
    ipcMain: IpcMain;
    windowController: ProductDialogIpcWindowController;
    eventController: ProductDialogEventController;
    showMessage(request: ProductDialogMessageRequest, sender: unknown): void;
}


const messageTypes = new Set(["info", "warning", "error", "question"]);


const dialogOpenFailureMessage = function(
    readiness: ProductDialogOpenReadiness
): ProductDialogMessageRequest {
    const packageUpdateRequired =
        readiness.status === "r-package-update-required";

    return {
        type: packageUpdateRequired ? "warning" : "error",
        message: packageUpdateRequired
            ? "Package update required"
            : "Unable to open dialog",
        detail: packageUpdateRequired
            ? [
                readiness.error,
                "Use Packages > Update development versions for development packages, or Packages > Install required R packages for missing packages."
            ].join("\n\n")
            : readiness.error
    };
};


const readMessageType = function(
    value: unknown
): ProductDialogMessageRequest["type"] {
    const type = String(value ?? "").trim().toLowerCase();

    return messageTypes.has(type)
        ? type as ProductDialogMessageRequest["type"]
        : "info";
};


export const createProductDialogIpcController = function(
    options: ProductDialogIpcControllerOptions
): void {
    options.ipcMain.handle(dialogRuntimeIpcChannels.openProductDialog, async (
        _event: IpcMainInvokeEvent,
        input: { dialogId?: string }
    ) => {
        const dialogId = String(input?.dialogId || "").trim();

        if (!dialogId) {
            return {
                status: "invalid",
                dialogId
            };
        }

        let readiness: ProductDialogOpenReadiness;

        try {
            readiness = await options.windowController.prepareOpen(dialogId);
        }
        catch (error) {
            readiness = {
                ok: false,
                error: error instanceof Error
                    ? error.message
                    : String(error || "Unable to prepare dialog dependencies.")
            };
        }

        if (!readiness.ok) {
            options.showMessage(dialogOpenFailureMessage(readiness), _event.sender);

            return {
                status: readiness.status || "blocked",
                dialogId
            };
        }

        options.windowController.open(dialogId);

        return {
            status: "opened",
            dialogId
        };
    });

    options.ipcMain.on(dialogRuntimeEventChannels.commandUpdate, (
        event: IpcMainEvent,
        command: unknown
    ) => {
        options.eventController.updateCommand(event.sender.id, command);
    });

    options.ipcMain.on(dialogRuntimeEventChannels.showMessage, (
        event: IpcMainEvent,
        type: unknown,
        message: unknown,
        detail: unknown
    ) => {
        const text = String(message ?? "").trim();

        if (!text) {
            return;
        }

        options.showMessage({
            type: readMessageType(type),
            message: text,
            detail: String(detail ?? "")
        }, event.sender);
    });

    options.ipcMain.on(dialogRuntimeEventChannels.showError, (
        event: IpcMainEvent,
        message: unknown,
        detail: unknown
    ) => {
        const text = String(message ?? "").trim();

        if (!text) {
            return;
        }

        options.showMessage({
            type: "error",
            message: text,
            detail: String(detail ?? "")
        }, event.sender);
    });

    options.ipcMain.on(dialogRuntimeEventChannels.log, (
        _event: IpcMainEvent,
        message: unknown
    ) => {
        console.error("DIALOG-RUNTIME:", String(message ?? ""));
    });

    options.ipcMain.on(dialogRuntimeEventChannels.stateUpdate, (
        _event: IpcMainEvent,
        payload: ProductDialogStateUpdate
    ) => {
        options.eventController.updateState(payload);
    });

    options.ipcMain.on(dialogRuntimeEventChannels.closeWindow, (
        _event: IpcMainEvent,
        payload: ProductDialogCloseRequest
    ) => {
        options.eventController.close(payload);
    });
};

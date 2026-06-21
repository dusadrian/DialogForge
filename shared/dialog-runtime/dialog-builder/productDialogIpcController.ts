import type {
    IpcMain,
    IpcMainEvent,
    IpcMainInvokeEvent
} from "electron";

import type {
    ProductDialogEventController,
    ProductDialogStateUpdate,
    ProductDialogCloseRequest
} from "./productDialogEventController";
import {
    dialogRuntimeEventChannels,
    dialogRuntimeIpcChannels
} from "../dialogRuntimeIpc";


export interface ProductDialogIpcWindowController {
    open(dialogId: string): unknown;
}


export interface ProductDialogIpcControllerOptions {
    ipcMain: IpcMain;
    windowController: ProductDialogIpcWindowController;
    eventController: ProductDialogEventController;
}


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

import type {
    IpcMain,
    IpcMainInvokeEvent
} from "electron";

import type {
    CopyPayload
} from "../../dataset-editor/clipboard/copyPayload";
import type {
    ShellClipboardController
} from "./shellClipboardController";
import {
    shellClipboardIpcChannels
} from "./shellClipboardIpc";


export interface ShellClipboardIpcControllerOptions {
    ipcMain: IpcMain;
    clipboardController: ShellClipboardController;
}


export const createShellClipboardIpcController = function(
    options: ShellClipboardIpcControllerOptions
): void {
    options.ipcMain.handle(shellClipboardIpcChannels.copyPayload, async (
        _event: IpcMainInvokeEvent,
        payload: CopyPayload
    ) => {
        return options.clipboardController.copyPayload(payload);
    });

    options.ipcMain.handle(shellClipboardIpcChannels.readText, async () => {
        return options.clipboardController.readText();
    });
};

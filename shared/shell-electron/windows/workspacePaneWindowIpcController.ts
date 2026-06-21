import {
    BrowserWindow
} from "electron";
import type {
    IpcMain,
    IpcMainInvokeEvent
} from "electron";

import type {
    WorkspacePaneWindowController,
    WorkspacePaneWindowRequest
} from "./workspacePaneWindowController";
import {
    shellWindowIpcChannels
} from "./shellWindowIpc";


export interface WorkspacePaneWindowIpcControllerOptions {
    ipcMain: IpcMain;
    windowController: WorkspacePaneWindowController;
}


export const createWorkspacePaneWindowIpcController = function(
    options: WorkspacePaneWindowIpcControllerOptions
): void {
    options.ipcMain.handle(shellWindowIpcChannels.setWorkspacePaneVisible, async (
        event: IpcMainInvokeEvent,
        input: WorkspacePaneWindowRequest
    ) => {
        const win = BrowserWindow.fromWebContents(event.sender);

        if (!win || win.isDestroyed()) {
            return {
                ok: false,
                reason: "window-unavailable"
            };
        }

        return options.windowController.setVisible(win, input || {});
    });
};

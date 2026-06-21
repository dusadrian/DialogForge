import {
    BrowserWindow
} from "electron";
import type {
    IpcMain
} from "electron";

import type {
    ApplicationComposition
} from "../../core/contracts/applicationComposition";
import {
    createApplicationCompositionIpcController
} from "../../base-app/bootstrap/applicationCompositionIpcController";
import {
    createShellApplicationIpcController
} from "./shellApplicationIpcController";
import {
    shellWindowIpcChannels
} from "./shellWindowIpc";


export interface ApplicationShellIpcCompositionOptions {
    ipcMain: IpcMain;
    getComposition(): ApplicationComposition;
    openDevDiagnostics(): BrowserWindow;
    showDevDiagnostics: boolean;
}


export const registerApplicationShellIpc = function(
    options: ApplicationShellIpcCompositionOptions
): void {
    createApplicationCompositionIpcController({
        ipcMain: options.ipcMain,
        getComposition: options.getComposition
    });

    options.ipcMain.handle(
        shellWindowIpcChannels.setMainWindowTitle,
        (event, input: { title?: string }) => {
            const title = String(input?.title || "").trim();
            const win = BrowserWindow.fromWebContents(event.sender);

            if (!title || !win || win.isDestroyed()) {
                return;
            }

            win.setTitle(title);
        }
    );

    createShellApplicationIpcController({
        ipcMain: options.ipcMain,
        openDevDiagnostics: function(): void {
            const win = options.openDevDiagnostics();

            if (options.showDevDiagnostics) {
                win.show();
                win.focus();
            }
        }
    });
};

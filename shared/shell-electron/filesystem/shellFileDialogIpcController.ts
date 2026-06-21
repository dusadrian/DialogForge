import type {
    IpcMain,
    IpcMainInvokeEvent
} from "electron";

import type {
    ShellFileDialogController
} from "./shellFileDialogController";
import {
    shellFileDialogIpcChannels
} from "./shellFileDialogIpc";


export interface ShellFileDialogIpcControllerOptions {
    ipcMain: IpcMain;
    fileDialogController: ShellFileDialogController;
}


export const createShellFileDialogIpcController = function(
    options: ShellFileDialogIpcControllerOptions
): void {
    options.ipcMain.handle(shellFileDialogIpcChannels.selectImportFile, async () => {
        return options.fileDialogController.openImportFile();
    });

    options.ipcMain.handle(shellFileDialogIpcChannels.legacyOpenImportFile, async () => {
        return options.fileDialogController.openImportFileLegacy();
    });

    options.ipcMain.handle(shellFileDialogIpcChannels.selectWorkingDirectory, async () => {
        return options.fileDialogController.selectWorkingDirectory();
    });

    options.ipcMain.handle(shellFileDialogIpcChannels.selectWorkspaceOpenFile, async () => {
        return options.fileDialogController.selectWorkspaceOpenFile();
    });

    options.ipcMain.handle(shellFileDialogIpcChannels.selectWorkspaceSaveFile, async () => {
        return options.fileDialogController.selectWorkspaceSaveFile();
    });

    options.ipcMain.handle(shellFileDialogIpcChannels.selectScriptFile, async () => {
        return options.fileDialogController.selectScriptFile();
    });

    options.ipcMain.handle(shellFileDialogIpcChannels.inspectPath, async (
        _event: IpcMainInvokeEvent,
        filePathInput: unknown
    ) => {
        return options.fileDialogController.inspectPath(filePathInput);
    });
};

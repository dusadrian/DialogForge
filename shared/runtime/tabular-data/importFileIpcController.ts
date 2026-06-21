import type {
    IpcMain,
    IpcMainInvokeEvent
} from "electron";

import type {
    ImportPlanRequest
} from "../provider-contract/runtimeProvider";
import type {
    ImportPreviewRequest
} from "./importPreview";
import type {
    ImportFileController
} from "./importFileController";
import {
    importFileIpcChannels
} from "./importFileIpc";


export interface ImportFileIpcControllerOptions {
    ipcMain: IpcMain;
    importFileController: ImportFileController;
}


export const createImportFileIpcController = function(
    options: ImportFileIpcControllerOptions
): void {
    options.ipcMain.handle(importFileIpcChannels.plan, async (
        _event: IpcMainInvokeEvent,
        input: Partial<ImportPlanRequest>
    ) => {
        return options.importFileController.planFile(input || {});
    });

    const previewFile = async function(
        _event: IpcMainInvokeEvent,
        input: Partial<ImportPreviewRequest>
    ) {
        return options.importFileController.previewFile(input || {});
    };

    options.ipcMain.handle(importFileIpcChannels.preview, previewFile);
    options.ipcMain.handle(importFileIpcChannels.legacyPreview, previewFile);
};

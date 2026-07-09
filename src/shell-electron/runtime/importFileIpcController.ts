import type {
    IpcMain,
    IpcMainInvokeEvent
} from "electron";

import type {
    ImportPlanRequest
} from "../../runtime/provider-contract/runtimeProvider";
import type {
    ImportPreviewRequest
} from "../../runtime/tabular-data/importPreview";
import type {
    ImportFileController
} from "../../runtime/tabular-data/importFileController";
import {
    importFileIpcChannels
} from "../../runtime/tabular-data/importFileIpc";


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

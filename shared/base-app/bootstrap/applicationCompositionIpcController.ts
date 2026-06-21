import type { IpcMain } from "electron";

import type {
    ApplicationComposition
} from "../../core/contracts/applicationComposition";
import {
    applicationCompositionIpcChannels
} from "./applicationCompositionIpc";


export interface ApplicationCompositionIpcControllerOptions {
    ipcMain: IpcMain;
    getComposition(): ApplicationComposition;
}


export const createApplicationCompositionIpcController = function(
    options: ApplicationCompositionIpcControllerOptions
): void {
    options.ipcMain.handle(applicationCompositionIpcChannels.get, async () => {
        return options.getComposition();
    });
};

import type {
    IpcMain,
    IpcMainInvokeEvent
} from "electron";

import type {
    ConsoleHistorySettingsStore
} from "./consoleHistorySettingsStore";
import {
    consoleHistoryIpcChannels
} from "./consoleHistoryIpc";


export interface ConsoleHistoryIpcControllerOptions {
    ipcMain: IpcMain;
    historyStore: ConsoleHistorySettingsStore;
}


export const createConsoleHistoryIpcController = function(
    options: ConsoleHistoryIpcControllerOptions
): void {
    options.ipcMain.handle(consoleHistoryIpcChannels.read, async (
        _event: IpcMainInvokeEvent,
        input: Record<string, unknown>
    ) => {
        return options.historyStore.read(input || {});
    });

    options.ipcMain.handle(consoleHistoryIpcChannels.write, async (
        _event: IpcMainInvokeEvent,
        input: Record<string, unknown>
    ) => {
        return options.historyStore.write(input || {});
    });
};

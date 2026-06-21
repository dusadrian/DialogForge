import * as os from "os";
import * as path from "path";

import type { IpcMain } from "electron";
import {
    shellWindowIpcChannels
} from "./shellWindowIpc";


export interface ShellApplicationIpcControllerOptions {
    ipcMain: IpcMain;
    openDevDiagnostics(): void;
}


export const createShellApplicationIpcController = function(
    options: ShellApplicationIpcControllerOptions
): void {
    const resolveDefaultWorkingDirectory = function(): string {
        const current = String(process.cwd() || "").trim();

        if (!current || current === path.sep) {
            return os.homedir();
        }

        return current;
    };

    options.ipcMain.handle(shellWindowIpcChannels.openDevDiagnostics, async () => {
        options.openDevDiagnostics();

        return {
            status: "opened",
            message: "Developer diagnostics window opened."
        };
    });

    options.ipcMain.handle(shellWindowIpcChannels.getWorkingDirectory, async () => {
        return {
            path: resolveDefaultWorkingDirectory(),
            home: os.homedir()
        };
    });
};

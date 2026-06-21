import {
    BrowserWindow
} from "electron";
import type {
    IpcMain,
    IpcMainInvokeEvent
} from "electron";

import type {
    RuntimeSessionSnapshot
} from "../../../provider-contract/runtimeProvider";
import {
    runtimeSessionIpcChannels,
    type RuntimeRestartRequest
} from "../../../../core/ipc/runtimeSessionIpc";
import type {
    PackageInstallDialogController
} from "./packageInstallDialogController";
import {
    packageInstallIpcChannels
} from "./packageInstallIpc";


export interface PackageInstallIpcControllerOptions {
    ipcMain: IpcMain;
    dialogController: PackageInstallDialogController;
    getMainWindow(): BrowserWindow | null;
    getProductId(): string;
    restartRuntime(
        action: "clean" | "restore",
        source: string
    ): Promise<RuntimeSessionSnapshot>;
}


const restartAction = function(value: unknown): "clean" | "restore" {
    return String(value || "clean") === "restore"
        ? "restore"
        : "clean";
};


const parentWindow = function(
    event: IpcMainInvokeEvent,
    options: PackageInstallIpcControllerOptions
): BrowserWindow | undefined {
    return BrowserWindow.fromWebContents(event.sender)
        || options.getMainWindow()
        || undefined;
};


export const createPackageInstallIpcController = function(
    options: PackageInstallIpcControllerOptions
): void {
    options.ipcMain.handle(packageInstallIpcChannels.confirmRestart, async (
        event: IpcMainInvokeEvent,
        payload: { packages?: string[] }
    ) => {
        return options.dialogController.confirmRestartForLoadedPackages(
            parentWindow(event, options),
            payload || {}
        );
    });

    options.ipcMain.handle(packageInstallIpcChannels.chooseLibrary, async (
        event: IpcMainInvokeEvent,
        payload: { userLibrary?: string; defaultLibrary?: string }
    ) => {
        return options.dialogController.chooseInstallLibrary(
            parentWindow(event, options),
            payload || {}
        );
    });

    options.ipcMain.handle(runtimeSessionIpcChannels.restart, async (
        _event: IpcMainInvokeEvent,
        payload: RuntimeRestartRequest
    ) => {
        return options.restartRuntime(
            restartAction(payload?.action),
            "base-app.runtime-restart"
        );
    });

    options.ipcMain.handle(runtimeSessionIpcChannels.restartForPackages, async (
        _event: IpcMainInvokeEvent,
        payload: RuntimeRestartRequest
    ) => {
        return options.restartRuntime(
            restartAction(payload?.action),
            `${options.getProductId()}.packages.restart`
        );
    });
};

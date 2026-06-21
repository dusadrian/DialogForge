import * as fs from "fs";
import * as path from "path";
import type { BrowserWindow, IpcMain } from "electron";
import type {
    RuntimeSessionManager,
    RuntimeSessionSnapshot
} from "../../runtime/provider-contract/runtimeProvider";
import type {
    PackageInstallDialogController
} from "../../runtime/providers/r/dependencies/packageInstallDialogController";
import {
    createPackageInstallIpcController
} from "../../runtime/providers/r/dependencies/packageInstallIpcController";
import { createRuntimeRestartController } from "./runtimeRestartController";


export interface RuntimeRestartCompositionOptions {
    ipcMain: IpcMain;
    runtimeSessionManager: RuntimeSessionManager;
    temporaryDirectory: string;
    packageInstallDialogController: PackageInstallDialogController;
    getMainWindow(): BrowserWindow | null;
    productId: string;
    invalidateDatasetPreview(): void;
    setRuntimeSession(snapshot: RuntimeSessionSnapshot): void;
    sendRuntimeSession(snapshot: RuntimeSessionSnapshot): void;
    refreshWorkspace(): Promise<unknown>;
    captureWorkspaceBaseline(source: string): Promise<void>;
}


export const registerRuntimeRestartComposition = function(
    options: RuntimeRestartCompositionOptions
): void {
    const controller = createRuntimeRestartController({
        runtimeSessionManager: options.runtimeSessionManager,
        createWorkspacePath: function(): string {
            return path.join(
                options.temporaryDirectory,
                `dialogforge-runtime-restart-${process.pid}-${Date.now()}.RData`
            );
        },
        removeWorkspaceFile: function(filePath): void {
            try {
                fs.rmSync(filePath, { force: true });
            } catch {}
        },
        invalidateDatasetPreview: options.invalidateDatasetPreview,
        setRuntimeSession: options.setRuntimeSession,
        sendRuntimeSession: options.sendRuntimeSession,
        refreshWorkspace: options.refreshWorkspace,
        captureWorkspaceBaseline: options.captureWorkspaceBaseline
    });

    createPackageInstallIpcController({
        ipcMain: options.ipcMain,
        dialogController: options.packageInstallDialogController,
        getMainWindow: options.getMainWindow,
        getProductId: function(): string {
            return options.productId;
        },
        restartRuntime: controller.restart
    });
};

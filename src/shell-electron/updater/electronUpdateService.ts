import type {
    App,
    BrowserWindow,
    Dialog,
    MessageBoxOptions
} from "electron";
import {
    autoUpdater as electronAutoUpdater
} from "electron-updater";
import type {
    AppUpdater,
    ProgressInfo,
    UpdateInfo
} from "electron-updater";
import * as fs from "fs";
import * as path from "path";



export interface ElectronUpdateServiceOptions {
    app: App;
    dialog: Dialog;
    productName: string;
    enabled: boolean;
    smokeMode: boolean;
    getMainWindow(): BrowserWindow | null;
    onDownloadProgress?(state: {
        active: boolean;
        percent: number;
        productName: string;
    }): void;
    reportError(error: unknown): void;
}


export interface ElectronUpdateService {
    checkForUpdates(): void;
}


const formatVersion = function(info: UpdateInfo): string {
    return String(info.version || "").trim();
};


const isMissingUpdateMetadataError = function(error: unknown): boolean {
    const message = String(
        error instanceof Error
            ? `${error.name} ${error.message}`
            : error || ""
    ).toLowerCase();

    const referencesUpdateMetadata = message.includes("latest.yml")
        || message.includes("latest-mac.yml")
        || message.includes("latest-linux.yml")
        || message.includes("app-update.yml")
        || message.includes("channel file");
    const indicatesMissing = message.includes("status 404")
        || message.includes(" 404")
        || message.includes("not found")
        || message.includes("enoent")
        || message.includes("cannot find channel");

    return referencesUpdateMetadata && indicatesMissing;
};


const showMessageBox = function(
    dialog: Dialog,
    parent: BrowserWindow | null,
    options: MessageBoxOptions
) {
    return parent && !parent.isDestroyed()
        ? dialog.showMessageBox(parent, options)
        : dialog.showMessageBox(options);
};


export const createElectronUpdateService = function(
    options: ElectronUpdateServiceOptions
): ElectronUpdateService {
    const autoUpdater: AppUpdater = electronAutoUpdater;
    let checking = false;
    let downloading = false;
    let downloaded = false;
    let installRequested = false;
    let progressTitleRestore: string | null = null;

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    if (process.platform === "linux") {
        const clearUpdaterCacheOnStartup = async function() {
            try {
                const cacheDir = (autoUpdater as any).cacheDir;
                if (cacheDir) {
                    const pendingDir = path.join(cacheDir, "pending");
                    if (fs.existsSync(pendingDir)) {
                        await fs.promises.rm(pendingDir, { recursive: true, force: true });
                        console.log(`Cleared updater pending cache directory on startup: ${pendingDir}`);
                    }
                }
            } catch (error) {
                options.reportError(new Error(`Failed to clear updater cache on startup: ${String(error)}`));
            }
        };
        void clearUpdaterCacheOnStartup();
    }

    const productName = options.productName || options.app.name || "Application";

    const updateDownloadProgress = function(percent: number): void {
        const normalizedPercent = Math.max(0, Math.min(100, percent || 0));
        const win = options.getMainWindow();

        options.onDownloadProgress?.({
            active: true,
            percent: normalizedPercent,
            productName
        });

        if (!win || win.isDestroyed()) {
            return;
        }

        if (progressTitleRestore === null) {
            progressTitleRestore = win.getTitle();
        }

        win.setProgressBar(normalizedPercent / 100);
        win.setTitle(`${productName} - Downloading update ${normalizedPercent.toFixed(0)}%`);
    };

    const clearDownloadProgress = function(): void {
        const win = options.getMainWindow();

        options.onDownloadProgress?.({
            active: false,
            percent: 0,
            productName
        });

        if (!win || win.isDestroyed()) {
            progressTitleRestore = null;
            return;
        }

        win.setProgressBar(-1);
        if (progressTitleRestore !== null) {
            win.setTitle(progressTitleRestore);
        }
        progressTitleRestore = null;
    };

    const showUpdateError = async function(message: string, error?: unknown): Promise<void> {
        const detail = error instanceof Error
            ? error.message
            : String(error || "");

        await showMessageBox(options.dialog, options.getMainWindow(), {
            type: "error",
            title: productName,
            message,
            detail,
            buttons: [
                "OK"
            ],
            defaultId: 0,
            noLink: true
        });
    };

    const downloadUpdate = async function(info: UpdateInfo): Promise<void> {
        if (downloading || downloaded) {
            return;
        }

        const version = formatVersion(info);
        const prompt = await showMessageBox(options.dialog, options.getMainWindow(), {
            type: "info",
            title: productName,
            message: version
                ? `${productName} ${version} is available.`
                : `A new version of ${productName} is available.`,
            detail: "Download the update now?",
            buttons: [
                "Download",
                "Later"
            ],
            defaultId: 0,
            cancelId: 1,
            noLink: true
        });

        if (prompt.response !== 0) {
            return;
        }

        downloading = true;
        updateDownloadProgress(0);
        await autoUpdater.downloadUpdate();
    };

    const restartToInstall = async function(info: UpdateInfo): Promise<void> {
        if (downloaded) {
            return;
        }

        downloaded = true;
        downloading = false;

        const version = formatVersion(info);
        const prompt = await showMessageBox(options.dialog, options.getMainWindow(), {
            type: "info",
            title: productName,
            message: "Update ready.",
            detail: version
                ? `Restart ${productName} to update to version ${version}.`
                : `Restart ${productName} to apply the update.`,
            buttons: [
                "Restart to update",
                "Later"
            ],
            defaultId: 0,
            cancelId: 1,
            noLink: true
        });

        if (prompt.response === 0 && !installRequested) {
            installRequested = true;
            autoUpdater.quitAndInstall();

            setTimeout(() => {
                void showUpdateError(
                    "The update installer did not start.",
                    `Please close ${productName} and open it again to complete the update.`
                ).catch(options.reportError);
            }, 15000);
        }
    };

    autoUpdater.on("update-available", (info) => {
        void downloadUpdate(info).catch(options.reportError);
    });

    autoUpdater.on("update-downloaded", (info) => {
        clearDownloadProgress();
        void restartToInstall(info).catch(options.reportError);
    });

    autoUpdater.on("download-progress", (progress: ProgressInfo) => {
        const percent = Math.max(0, Math.min(100, progress.percent || 0));
        updateDownloadProgress(percent);
        console.log(`Update download progress: ${percent.toFixed(1)}%`);
    });

    autoUpdater.on("error", (error) => {
        checking = false;
        downloading = false;
        installRequested = false;
        clearDownloadProgress();

        if (isMissingUpdateMetadataError(error)) {
            return;
        }

        options.reportError(error);
        void showUpdateError("Update failed.", error).catch(options.reportError);
    });

    return {
        checkForUpdates: function(): void {
            if (!options.enabled
                || options.smokeMode
                || !options.app.isPackaged
                || checking
                || downloading
                || downloaded) {
                return;
            }

            checking = true;
            void autoUpdater.checkForUpdates()
                .catch((error) => {
                    if (isMissingUpdateMetadataError(error)) {
                        return;
                    }

                    options.reportError(error);
                })
                .finally(() => {
                    checking = false;
                });
        }
    };
};

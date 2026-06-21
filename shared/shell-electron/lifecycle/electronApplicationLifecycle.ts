import {
    BrowserWindow
} from "electron";
import type {
    App
} from "electron";


interface RuntimeQuitSupport {
    handleBeforeQuit(event: { preventDefault(): void }): void;
    handleWillQuit(): void;
}


export interface ElectronApplicationLifecycleOptions {
    app: App;
    smokeMode: boolean;
    initializeZoom(): void;
    installApplicationMenu(): void;
    createMainWindow(): BrowserWindow;
    setMainWindow(win: BrowserWindow | null): void;
    autoStartRuntime(): Promise<void>;
    runSmoke(win: BrowserWindow): Promise<void>;
    stopRuntime(): Promise<void>;
    preloadDatasetEditor(): Promise<unknown>;
    appendBootLog(message: string): void;
    requestApplicationQuit(): void;
    runtimeQuitController: RuntimeQuitSupport;
    stopHelpServer(): void;
    reportError(error: unknown): void;
}


export const bindElectronApplicationLifecycle = function(
    options: ElectronApplicationLifecycleOptions
): void {
    let mainWindow: BrowserWindow | null = null;
    const rememberMainWindow = function(win: BrowserWindow | null): void {
        mainWindow = win;
        options.setMainWindow(win);
    };

    options.app.whenReady().then(async () => {
        options.initializeZoom();
        options.installApplicationMenu();
        const win = options.createMainWindow();

        rememberMainWindow(win);

        if (process.platform === "darwin" && !options.smokeMode) {
            options.app.focus({
                steal: true
            });
        }

        win.on("closed", () => {
            if (mainWindow === win) {
                rememberMainWindow(null);
            }
        });

        if (options.smokeMode) {
            try {
                await options.autoStartRuntime();
                await options.runSmoke(win);
                await options.stopRuntime();
                options.app.exit(0);
            } catch (error) {
                options.reportError(error);
                await options.stopRuntime();
                options.app.exit(1);
            }

            return;
        }

        void options.autoStartRuntime().catch(options.reportError);
        void options.preloadDatasetEditor().catch(options.reportError);

        options.app.on("activate", () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                rememberMainWindow(options.createMainWindow());
            }
        });
    });

    options.app.on("before-quit", (event) => {
        options.appendBootLog("app before-quit");
        options.requestApplicationQuit();
        options.runtimeQuitController.handleBeforeQuit(event);
    });

    options.app.on("will-quit", () => {
        options.appendBootLog("app will-quit");
        options.stopHelpServer();
        options.runtimeQuitController.handleWillQuit();
    });

    options.app.on("window-all-closed", () => {
        if (process.platform !== "darwin") {
            options.app.quit();
        }
    });
};

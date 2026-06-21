import * as path from "path";
import {
    BrowserWindow
} from "electron";
import {
    applySavedWindowState,
    wireWindowStatePersistence
} from "./windowState";
import {
    createMainWindowController,
    type MainWindowController
} from "./mainWindowController";
import {
    createMainWindowZoomController
} from "./mainWindowZoomController";


interface WorkspacePaneWindowSupport {
    bindResizeTracking(win: BrowserWindow): void;
    forget(windowId: number): void;
}


export interface MainWindowCompositionOptions {
    rootDir: string;
    productId: string;
    settingsPath: string;
    title: string;
    nativeWindowIconPath?: string;
    minimumWidth: number;
    minimumHeight: number;
    showOnReady(): boolean;
    readSettings(): Record<string, unknown>;
    writeSettings(settings: Record<string, unknown>): void;
    workspacePaneWindowController: WorkspacePaneWindowSupport;
}


export interface MainWindowComposition {
    controller: MainWindowController;
    zoomController: ReturnType<typeof createMainWindowZoomController>;
    createWindow(): BrowserWindow;
}


export const createMainWindowComposition = function(
    options: MainWindowCompositionOptions
): MainWindowComposition {
    const zoomController = createMainWindowZoomController({
        defaultZoomFactor: 1,
        readStoredZoomFactor: function(): unknown {
            return options.readSettings().dialogZoomFactor;
        },
        persistZoomFactor: function(zoomFactor): void {
            options.writeSettings(Object.assign({}, options.readSettings(), {
                dialogZoomFactor: zoomFactor
            }));
        }
    });
    const controller = createMainWindowController({
        pagePath: path.join(
            options.rootDir,
            "shared/base-app/pages/main.html"
        ),
        showOnReady: options.showOnReady,
        createWindow: function(): BrowserWindow {
            const windowKey = `${options.productId}.main`;
            const windowOptions = applySavedWindowState(
                options.settingsPath,
                windowKey,
                {
                    width: options.minimumWidth,
                    height: options.minimumHeight,
                    minWidth: options.minimumWidth,
                    minHeight: options.minimumHeight,
                    center: true,
                    show: false,
                    title: options.title,
                    icon: options.nativeWindowIconPath,
                    webPreferences: {
                        preload: path.join(
                            options.rootDir,
                            "shared/base-app/bootstrap/preload.js"
                        ),
                        contextIsolation: false,
                        nodeIntegration: true,
                        sandbox: false
                    }
                }
            );
            const win = new BrowserWindow(windowOptions);

            win.webContents.on("page-title-updated", (event) => {
                event.preventDefault();
            });
            win.webContents.once("did-finish-load", () => {
                if (!win.isDestroyed()) {
                    win.webContents.focus();
                    win.setTitle(options.title);
                }
            });
            wireWindowStatePersistence(
                win,
                options.settingsPath,
                windowKey
            );
            options.workspacePaneWindowController.bindResizeTracking(win);
            const windowId = win.id;

            win.on("closed", () => {
                options.workspacePaneWindowController.forget(windowId);
            });
            zoomController.bindShortcuts(win);

            return win;
        }
    });

    return {
        controller,
        zoomController,
        createWindow: controller.open
    };
};

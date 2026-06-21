import * as path from "path";
import {
    BrowserWindow
} from "electron";

import {
    applySavedWindowState,
    wireWindowStatePersistence
} from "./windowState";


export interface DevDiagnosticsWindowControllerOptions {
    rootDir: string;
    productId: string;
    settingsPath: string;
    nativeWindowIconPath?: string;
    showOnOpen: boolean;
}

export interface DevDiagnosticsWindowController {
    open(): BrowserWindow;
    getWindow(): BrowserWindow | null;
}


export const createDevDiagnosticsWindowController = function(
    options: DevDiagnosticsWindowControllerOptions
): DevDiagnosticsWindowController {
    let devDiagnosticsWindow: BrowserWindow | null = null;

    const open = function(): BrowserWindow {
        if (devDiagnosticsWindow && !devDiagnosticsWindow.isDestroyed()) {
            return devDiagnosticsWindow;
        }

        const windowKey = `${options.productId}.devDiagnostics`;
        const windowOptions = applySavedWindowState(
            options.settingsPath,
            windowKey,
            {
                width: 980,
                height: 720,
                minWidth: 640,
                minHeight: 420,
                show: options.showOnOpen,
                title: "Developer Diagnostics",
                icon: options.nativeWindowIconPath || undefined,
                webPreferences: {
                    preload: path.join(
                        options.rootDir,
                        "shared/base-app/bootstrap/preload.js"
                    ),
                    contextIsolation: false,
                    nodeIntegration: true
                }
            }
        );

        devDiagnosticsWindow = new BrowserWindow(windowOptions);
        wireWindowStatePersistence(
            devDiagnosticsWindow,
            options.settingsPath,
            windowKey
        );
        devDiagnosticsWindow.loadFile(path.join(
            options.rootDir,
            "shared/base-app/pages/devDiagnostics.html"
        ));
        devDiagnosticsWindow.on("closed", () => {
            devDiagnosticsWindow = null;
        });

        return devDiagnosticsWindow;
    };

    return {
        open,
        getWindow: function(): BrowserWindow | null {
            return devDiagnosticsWindow;
        }
    };
};

import {
    BrowserWindow
} from "electron";
import * as path from "path";

import {
    applySavedWindowState,
    wireWindowStatePersistence
} from "../windows/windowState";


export interface SettingsWindowFactoryOptions {
    rootDir: string;
    productId: string;
    settingsPath: string;
    title: string | (() => string);
    nativeWindowIconPath?: string;
    getParentWindow(): BrowserWindow | null;
}


export const createSettingsWindowFactory = function (
    options: SettingsWindowFactoryOptions
): () => BrowserWindow {
    return function (): BrowserWindow {
        const windowKey = `${options.productId}.settings`;
        const settingsWindow = new BrowserWindow(
            applySavedWindowState(
                options.settingsPath,
                windowKey,
                {
                    width: 600,
                    height: 400,
                    minWidth: 360,
                    minHeight: 360,
                    resizable: true,
                    show: false,
                    title: typeof options.title === "function"
                        ? options.title()
                        : options.title,
                    parent: options.getParentWindow() || undefined,
                    icon: options.nativeWindowIconPath || undefined,
                    webPreferences: {
                        preload: path.join(
                            options.rootDir,
                            "src/shell-electron/bootstrap/preload.js"
                        ),
                        contextIsolation: false,
                        nodeIntegration: true
                    }
                },
                {
                    persistSize: true
                }
            )
        );

        wireWindowStatePersistence(
            settingsWindow,
            options.settingsPath,
            windowKey,
            { persistSize: true }
        );

        return settingsWindow;
    };
};

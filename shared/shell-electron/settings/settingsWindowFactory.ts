import {
    BrowserWindow
} from "electron";

import {
    applySavedWindowState,
    wireWindowStatePersistence
} from "../windows/windowState";


export interface SettingsWindowFactoryOptions {
    productId: string;
    settingsPath: string;
    title: string;
    nativeWindowIconPath?: string;
    getParentWindow(): BrowserWindow | null;
}


export const createSettingsWindowFactory = function(
    options: SettingsWindowFactoryOptions
): () => BrowserWindow {
    return function(): BrowserWindow {
        const windowKey = `${options.productId}.settings`;
        const settingsWindow = new BrowserWindow(
            applySavedWindowState(
                options.settingsPath,
                windowKey,
                {
                    width: 540,
                    height: 500,
                    resizable: false,
                    show: false,
                    title: options.title,
                    parent: options.getParentWindow() || undefined,
                    icon: options.nativeWindowIconPath || undefined,
                    webPreferences: {
                        contextIsolation: false,
                        nodeIntegration: true
                    }
                },
                {
                    persistSize: false
                }
            )
        );

        wireWindowStatePersistence(
            settingsWindow,
            options.settingsPath,
            windowKey,
            { persistSize: false }
        );

        return settingsWindow;
    };
};

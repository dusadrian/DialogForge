import {
    BrowserWindow
} from "electron";
import * as path from "path";

import {
    applySavedWindowState,
    wireWindowStatePersistence
} from "../windows/windowState";


export interface MenuCustomizationWindowFactoryOptions {
    rootDir: string;
    productId: string;
    settingsPath: string;
    title: string | (() => string);
    nativeWindowIconPath?: string;
    getParentWindow(): BrowserWindow | null;
}


export const createMenuCustomizationWindowFactory = function(
    options: MenuCustomizationWindowFactoryOptions
): () => BrowserWindow {
    return function(): BrowserWindow {
        const windowKey = `${options.productId}.menuCustomize`;
        const customizationWindow = new BrowserWindow(
            applySavedWindowState(
                options.settingsPath,
                windowKey,
                {
                    width: 800,
                    height: 600,
                    resizable: false,
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
                { persistSize: false }
            )
        );

        wireWindowStatePersistence(
            customizationWindow,
            options.settingsPath,
            windowKey,
            { persistSize: false }
        );

        return customizationWindow;
    };
};

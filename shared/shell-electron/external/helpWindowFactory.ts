import * as path from "path";
import {
    BrowserWindow
} from "electron";

import {
    applySavedWindowState,
    wireWindowStatePersistence
} from "../windows/windowState";


export interface HelpWindowFactoryOptions {
    rootDir: string;
    productId: string;
    settingsPath: string;
    nativeWindowIconPath?: string;
}


export const createHelpWindowFactory = function(
    options: HelpWindowFactoryOptions
): () => BrowserWindow {
    return function(): BrowserWindow {
        const windowKey = `${options.productId}.help`;
        const windowOptions = applySavedWindowState(
            options.settingsPath,
            windowKey,
            {
                width: 960,
                height: 760,
                minWidth: 720,
                minHeight: 480,
                autoHideMenuBar: true,
                show: false,
                title: "R Help",
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

        const win = new BrowserWindow(windowOptions);

        wireWindowStatePersistence(
            win,
            options.settingsPath,
            windowKey
        );

        return win;
    };
};

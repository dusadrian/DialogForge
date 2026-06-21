import * as path from "path";
import {
    BrowserWindow
} from "electron";

import {
    applySavedWindowState,
    wireWindowStatePersistence
} from "../windows/windowState";


export interface PlotViewerWindowFactoryOptions {
    rootDir: string;
    productId: string;
    settingsPath: string;
    nativeWindowIconPath?: string;
}


export const createPlotViewerWindowFactory = function(
    options: PlotViewerWindowFactoryOptions
): () => BrowserWindow {
    return function(): BrowserWindow {
        const windowKey = `${options.productId}.plotViewer`;
        const windowOptions = applySavedWindowState(
            options.settingsPath,
            windowKey,
            {
                width: 980,
                height: 760,
                minWidth: 420,
                minHeight: 320,
                autoHideMenuBar: true,
                show: false,
                title: "Plots",
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

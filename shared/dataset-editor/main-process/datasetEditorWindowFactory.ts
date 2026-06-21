import * as path from "path";
import {
    BrowserWindow
} from "electron";

import {
    applySavedWindowState,
    wireWindowStatePersistence
} from "../../shell-electron/windows/windowState";


export interface DatasetEditorWindowFactoryOptions {
    rootDir: string;
    productId: string;
    settingsPath: string;
    title(): string;
    nativeWindowIconPath?: string;
}


export const createDatasetEditorWindowFactory = function(
    options: DatasetEditorWindowFactoryOptions
): () => BrowserWindow {
    return function(): BrowserWindow {
        const windowKey = `${options.productId}.datasetEditor`;
        const win = new BrowserWindow(
            applySavedWindowState(
                options.settingsPath,
                windowKey,
                {
                    width: 1180,
                    height: 760,
                    minWidth: 840,
                    minHeight: 520,
                    show: false,
                    title: options.title(),
                    icon: options.nativeWindowIconPath || undefined,
                    webPreferences: {
                        contextIsolation: false,
                        nodeIntegration: true,
                        preload: path.join(
                            options.rootDir,
                            "shared/base-app/bootstrap/preload.js"
                        )
                    }
                }
            )
        );

        wireWindowStatePersistence(
            win,
            options.settingsPath,
            windowKey
        );

        return win;
    };
};

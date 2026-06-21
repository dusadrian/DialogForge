import * as path from "path";
import {
    BrowserWindow
} from "electron";

import {
    applySavedWindowState,
    wireWindowStatePersistence
} from "../../shell-electron/windows/windowState";


export interface ScriptEditorWindowFactoryOptions {
    rootDir: string;
    productId: string;
    settingsPath: string;
    title: string;
    nativeWindowIconPath?: string;
}


export const createScriptEditorWindowFactory = function(
    options: ScriptEditorWindowFactoryOptions
): () => BrowserWindow {
    return function(): BrowserWindow {
        const windowKey = `${options.productId}.scriptEditor`;
        const win = new BrowserWindow(
            applySavedWindowState(
                options.settingsPath,
                windowKey,
                {
                    width: 980,
                    height: 680,
                    minWidth: 560,
                    minHeight: 360,
                    show: false,
                    title: options.title,
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

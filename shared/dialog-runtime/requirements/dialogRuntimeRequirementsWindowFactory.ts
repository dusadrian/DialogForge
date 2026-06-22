import {
    BrowserWindow
} from "electron";

import {
    applySavedWindowState,
    wireWindowStatePersistence
} from "../../shell-electron/windows/windowState";


export interface DialogRuntimeRequirementsWindowFactoryOptions {
    productId: string;
    settingsPath: string;
    title: string | (() => string);
    nativeWindowIconPath?: string;
    getParentWindow(): BrowserWindow | null;
}


export const createDialogRuntimeRequirementsWindowFactory = function(
    options: DialogRuntimeRequirementsWindowFactoryOptions
): () => BrowserWindow {
    return function(): BrowserWindow {
        const windowKey = `${options.productId}.dialogRuntimeRequirements`;
        const requirementsWindow = new BrowserWindow(
            applySavedWindowState(
                options.settingsPath,
                windowKey,
                {
                    width: 540,
                    height: 420,
                    resizable: false,
                    show: false,
                    title: typeof options.title === "function"
                        ? options.title()
                        : options.title,
                    parent: options.getParentWindow() || undefined,
                    icon: options.nativeWindowIconPath || undefined,
                    webPreferences: {
                        contextIsolation: false,
                        nodeIntegration: true
                    }
                },
                { persistSize: false }
            )
        );

        wireWindowStatePersistence(
            requirementsWindow,
            options.settingsPath,
            windowKey,
            { persistSize: false }
        );

        return requirementsWindow;
    };
};

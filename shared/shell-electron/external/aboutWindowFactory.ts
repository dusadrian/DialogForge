import {
    BrowserWindow
} from "electron";


export interface AboutWindowFactoryOptions {
    nativeWindowIconPath?: string;
    getParentWindow(): BrowserWindow | null;
}


export const createAboutWindowFactory = function(
    options: AboutWindowFactoryOptions
): (title: string) => BrowserWindow {
    return function(title: string): BrowserWindow {
        return new BrowserWindow({
            width: 610,
            height: 500,
            resizable: false,
            minimizable: false,
            maximizable: false,
            title,
            parent: options.getParentWindow() || undefined,
            modal: false,
            center: true,
            autoHideMenuBar: true,
            backgroundColor: "#ffffff",
            icon: options.nativeWindowIconPath || undefined,
            webPreferences: {
                contextIsolation: false,
                nodeIntegration: true,
                sandbox: false
            }
        });
    };
};

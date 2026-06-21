import type { BrowserWindow } from "electron";


export interface MainWindowControllerOptions {
    createWindow(): BrowserWindow;
    pagePath: string;
    showOnReady(): boolean;
}


export interface MainWindowController {
    getWindow(): BrowserWindow | null;
    open(): BrowserWindow;
}


export const createMainWindowController = function(
    options: MainWindowControllerOptions
): MainWindowController {
    let win: BrowserWindow | null = null;

    const open = function(): BrowserWindow {
        if (win && !win.isDestroyed()) {
            win.focus();
            return win;
        }

        const nextWindow = options.createWindow();
        win = nextWindow;
        nextWindow.once("ready-to-show", () => {
            if (
                win === nextWindow &&
                !nextWindow.isDestroyed() &&
                options.showOnReady()
            ) {
                nextWindow.show();
                nextWindow.focus();
                nextWindow.webContents.focus();
            }
        });
        nextWindow.on("closed", () => {
            if (win === nextWindow) {
                win = null;
            }
        });
        void nextWindow.loadFile(options.pagePath);

        return nextWindow;
    };

    return {
        getWindow: function(): BrowserWindow | null {
            return win && !win.isDestroyed() ? win : null;
        },
        open
    };
};

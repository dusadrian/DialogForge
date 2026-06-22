import type { BrowserWindow } from "electron";
import {
    applicationSettingsEventChannels
} from "./applicationSettingsIpc";


export interface SettingsWindowControllerOptions {
    createWindow(): BrowserWindow;
    pagePath: string;
    readPayload(): unknown;
}


export interface SettingsWindowController {
    getWindow(): BrowserWindow | null;
    open(): BrowserWindow;
    refresh(): void;
    notifySaved(): void;
}


export const createSettingsWindowController = function(
    options: SettingsWindowControllerOptions
): SettingsWindowController {
    let win: BrowserWindow | null = null;

    const open = function(): BrowserWindow {
        if (win && !win.isDestroyed()) {
            win.focus();
            return win;
        }

        const nextWindow = options.createWindow();
        win = nextWindow;
        nextWindow.setMenu(null);
        nextWindow.on("closed", () => {
            if (win === nextWindow) {
                win = null;
            }
        });
        nextWindow.webContents.once("did-finish-load", () => {
            if (win !== nextWindow || nextWindow.isDestroyed()) {
                return;
            }

            nextWindow.webContents.send(
                applicationSettingsEventChannels.settingsLoaded,
                options.readPayload()
            );
            nextWindow.show();
        });
        void nextWindow.loadFile(options.pagePath);

        return nextWindow;
    };

    return {
        getWindow: function(): BrowserWindow | null {
            return win && !win.isDestroyed() ? win : null;
        },
        open,
        refresh: function(): void {
            if (!win || win.isDestroyed()) {
                return;
            }

            win.webContents.send(
                applicationSettingsEventChannels.settingsLoaded,
                options.readPayload()
            );
        },
        notifySaved: function(): void {
            if (!win || win.isDestroyed()) {
                return;
            }

            win.webContents.send(applicationSettingsEventChannels.settingsSaved);
        }
    };
};

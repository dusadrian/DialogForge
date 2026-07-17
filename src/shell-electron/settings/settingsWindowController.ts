import type { BrowserWindow } from "electron";
import {
    applicationSettingsEventChannels
} from "../../base-app/features/settings/applicationSettingsIpc";


export interface SettingsWindowControllerOptions {
    createWindow(): BrowserWindow;
    pagePath: string;
    readPayload(): unknown | Promise<unknown>;
    onClosed?(): void;
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
    const sendPayload = async function(
        target: BrowserWindow,
        showAfterSend: boolean
    ): Promise<void> {
        const payload = await options.readPayload();

        if (win !== target || target.isDestroyed()) {
            return;
        }

        target.webContents.send(
            applicationSettingsEventChannels.settingsLoaded,
            payload
        );
        if (showAfterSend) {
            target.show();
        }
    };

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
            options.onClosed?.();
        });
        nextWindow.webContents.once("did-finish-load", () => {
            void sendPayload(nextWindow, true);
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

            void sendPayload(win, false);
        },
        notifySaved: function(): void {
            if (!win || win.isDestroyed()) {
                return;
            }

            win.webContents.send(applicationSettingsEventChannels.settingsSaved);
        }
    };
};

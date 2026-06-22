import type { BrowserWindow } from "electron";
import {
    applicationSettingsEventChannels
} from "../settings/applicationSettingsIpc";


export interface MenuCustomizationWindowControllerOptions {
    createWindow(): BrowserWindow;
    pagePath: string;
    readPayload(): unknown;
}


export interface MenuCustomizationWindowController {
    getWindow(): BrowserWindow | null;
    notifyDialogBrowsed(payload: unknown): void;
    notifySaved(payload: unknown): void;
    refresh(): void;
    open(): BrowserWindow;
}


export const createMenuCustomizationWindowController = function(
    options: MenuCustomizationWindowControllerOptions
): MenuCustomizationWindowController {
    let win: BrowserWindow | null = null;

    const send = function(channel: string, payload: unknown): void {
        if (!win || win.isDestroyed()) {
            return;
        }

        win.webContents.send(channel, payload);
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
        });
        nextWindow.once("show", () => {
            if (win !== nextWindow || nextWindow.isDestroyed()) {
                return;
            }

            send(
                applicationSettingsEventChannels.menuCustomizationLoaded,
                options.readPayload()
            );
        });
        nextWindow.once("ready-to-show", () => {
            if (win === nextWindow && !nextWindow.isDestroyed()) {
                nextWindow.show();
            }
        });
        void nextWindow.loadFile(options.pagePath);

        return nextWindow;
    };

    return {
        getWindow: function(): BrowserWindow | null {
            return win && !win.isDestroyed() ? win : null;
        },
        notifyDialogBrowsed: function(payload: unknown): void {
            send(applicationSettingsEventChannels.menuDialogBrowsed, payload);
        },
        notifySaved: function(payload: unknown): void {
            send(applicationSettingsEventChannels.menuCustomizationSaved, payload);
        },
        refresh: function(): void {
            send(
                applicationSettingsEventChannels.menuCustomizationLoaded,
                options.readPayload()
            );
        },
        open
    };
};

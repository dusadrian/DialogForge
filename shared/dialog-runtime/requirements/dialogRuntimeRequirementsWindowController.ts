import type { BrowserWindow } from "electron";
import {
    dialogRuntimeEventChannels
} from "../dialogRuntimeIpc";


export interface DialogRuntimeRequirementsWindowControllerOptions {
    createWindow(): BrowserWindow;
    pagePath: string;
    readPayload(): unknown;
}


export interface DialogRuntimeRequirementsWindowController {
    getWindow(): BrowserWindow | null;
    notifySaved(payload: unknown): void;
    open(): BrowserWindow;
}


export const createDialogRuntimeRequirementsWindowController = function(
    options: DialogRuntimeRequirementsWindowControllerOptions
): DialogRuntimeRequirementsWindowController {
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
                dialogRuntimeEventChannels.requirementsLoaded,
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
        notifySaved: function(payload: unknown): void {
            if (!win || win.isDestroyed()) {
                return;
            }

            win.webContents.send(
                dialogRuntimeEventChannels.requirementsSaved,
                payload
            );
        },
        open
    };
};

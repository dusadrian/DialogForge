import type { BrowserWindow } from "electron";


export interface AboutWindowPayload {
    title: string;
    version: string;
    body: string[];
    highlights: string[];
    authorLabel: string;
    authorName: string;
    authorUrl: string;
    copyright: string;
}


export interface AboutWindowControllerOptions {
    createWindow(title: string): BrowserWindow;
    pagePath: string;
    hideMenuBar: boolean;
}


export interface AboutWindowController {
    getWindow(): BrowserWindow | null;
    open(payload: AboutWindowPayload): BrowserWindow;
    refresh(payload: AboutWindowPayload): void;
}


const renderScript = function(payload: AboutWindowPayload): string {
    return `
        window.renderDialogForgeAbout(${JSON.stringify(payload)});
    `;
};


export const createAboutWindowController = function(
    options: AboutWindowControllerOptions
): AboutWindowController {
    let win: BrowserWindow | null = null;
    let ready = false;
    let pendingPayload: AboutWindowPayload | null = null;

    const render = function(payload: AboutWindowPayload): void {
        if (!win || win.isDestroyed()) {
            return;
        }

        win.setTitle(payload.title);
        void win.webContents.executeJavaScript(
            renderScript(payload),
            true
        ).catch(() => {});
    };
    const open = function(payload: AboutWindowPayload): BrowserWindow {
        pendingPayload = payload;

        if (win && !win.isDestroyed()) {
            win.focus();

            if (ready) {
                pendingPayload = null;
                render(payload);
            }

            return win;
        }

        const nextWindow = options.createWindow(payload.title);
        win = nextWindow;
        ready = false;

        if (options.hideMenuBar) {
            nextWindow.removeMenu();
            nextWindow.setMenuBarVisibility(false);
        }

        nextWindow.on("closed", () => {
            if (win === nextWindow) {
                win = null;
                ready = false;
                pendingPayload = null;
            }
        });
        nextWindow.webContents.once("did-finish-load", () => {
            if (win !== nextWindow || nextWindow.isDestroyed()) {
                return;
            }

            ready = true;
            const queuedPayload = pendingPayload;
            pendingPayload = null;

            if (queuedPayload) {
                render(queuedPayload);
            }
        });
        void nextWindow.loadFile(options.pagePath);

        return nextWindow;
    };

    return {
        getWindow: function(): BrowserWindow | null {
            return win && !win.isDestroyed() ? win : null;
        },
        open,
        refresh: function(payload): void {
            pendingPayload = payload;

            if (ready) {
                pendingPayload = null;
                render(payload);
            }
        }
    };
};

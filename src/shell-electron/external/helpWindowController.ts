import type { BrowserWindow } from "electron";


export interface HelpWindowControllerOptions {
    createWindow(): BrowserWindow;
    showOnOpen: boolean;
}


export interface HelpWindowController {
    getWindow(): BrowserWindow | null;
    load(url: string, title: string): Promise<BrowserWindow>;
    openEntry(payload: Record<string, unknown>, title: string): Promise<boolean>;
}


export const createHelpWindowController = function(
    options: HelpWindowControllerOptions
): HelpWindowController {
    let win: BrowserWindow | null = null;

    const show = function(nextWindow: BrowserWindow): void {
        if (!options.showOnOpen || nextWindow.isDestroyed()) {
            return;
        }

        nextWindow.show();
        nextWindow.focus();
    };
    const create = function(): BrowserWindow {
        if (win && !win.isDestroyed()) {
            return win;
        }

        const nextWindow = options.createWindow();
        win = nextWindow;
        nextWindow.webContents.on("page-title-updated", (event) => {
            event.preventDefault();
        });
        nextWindow.webContents.on("will-navigate", (event) => {
            event.preventDefault();
        });
        nextWindow.webContents.setWindowOpenHandler(() => {
            return { action: "deny" };
        });
        nextWindow.once("ready-to-show", () => {
            if (win === nextWindow) {
                show(nextWindow);
            }
        });
        nextWindow.on("closed", () => {
            if (win === nextWindow) {
                win = null;
            }
        });

        return nextWindow;
    };
    const load = async function(
        url: string,
        title: string
    ): Promise<BrowserWindow> {
        const nextWindow = create();

        nextWindow.setTitle(title);
        await nextWindow.loadURL(url);
        show(nextWindow);

        return nextWindow;
    };
    const openEntry = async function(
        payload: Record<string, unknown>,
        title: string
    ): Promise<boolean> {
        const currentWindow = win && !win.isDestroyed() ? win : null;

        if (!currentWindow || currentWindow.webContents.isLoading()) {
            return false;
        }

        currentWindow.setTitle(title);

        try {
            await currentWindow.webContents.executeJavaScript(
                `window.postMessage(${JSON.stringify(payload)}, "*");`,
                true
            );
            show(currentWindow);
            return true;
        }
        catch {
            return false;
        }
    };

    return {
        getWindow: function(): BrowserWindow | null {
            return win && !win.isDestroyed() ? win : null;
        },
        load,
        openEntry
    };
};

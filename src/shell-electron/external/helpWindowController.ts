import type { BrowserWindow } from "electron";


export interface HelpWindowControllerOptions {
    createWindow(): BrowserWindow;
    showOnOpen: boolean;
    onClose?(): void;
}


export interface HelpWindowController {
    getWindow(): BrowserWindow | null;
    load(url: string, title: string, isCurrent?: () => boolean): Promise<BrowserWindow>;
    openEntry(payload: Record<string, unknown>, title: string, isCurrent?: () => boolean): Promise<boolean>;
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
        nextWindow.on("closed", () => {
            if (win === nextWindow) {
                win = null;
                options.onClose?.();
            }
        });

        return nextWindow;
    };
    const load = async function(
        url: string,
        title: string,
        isCurrent: () => boolean = () => true
    ): Promise<BrowserWindow> {
        const nextWindow = create();

        nextWindow.setTitle(title);
        const onReady = function(): void {
            if (isCurrent() && win === nextWindow && !nextWindow.isDestroyed()
                && nextWindow.webContents.getURL() === url) {
                show(nextWindow);
            }
        };
        nextWindow.once("ready-to-show", onReady);
        try {
            await nextWindow.loadURL(url);
        }
        finally {
            nextWindow.removeListener("ready-to-show", onReady);
        }
        if (isCurrent() && win === nextWindow && !nextWindow.isDestroyed()) {
            show(nextWindow);
        }

        return nextWindow;
    };
    const openEntry = async function(
        payload: Record<string, unknown>,
        title: string,
        isCurrent: () => boolean = () => true
    ): Promise<boolean> {
        const currentWindow = win && !win.isDestroyed() ? win : null;

        if (!isCurrent() || !currentWindow || currentWindow.webContents.isLoading()) {
            return false;
        }

        currentWindow.setTitle(title);

        try {
            await currentWindow.webContents.executeJavaScript(
                `window.postMessage(${JSON.stringify(payload)}, "*");`,
                true
            );
            if (!isCurrent() || win !== currentWindow || currentWindow.isDestroyed()) {
                return false;
            }
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

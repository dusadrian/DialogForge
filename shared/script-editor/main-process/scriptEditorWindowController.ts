import type {
    BrowserWindow,
    WebContents
} from "electron";

import type {
    PendingScriptFile
} from "./scriptEditorPendingWorkQueue";
import {
    scriptEditorEventChannels
} from "../scriptEditorIpc";


interface ScriptEditorPendingWork {
    enqueueInsertion(code: string): void;
    enqueueOpenFile(file: PendingScriptFile): void;
    flush(send: (channel: string, payload: unknown) => void): void;
    isRendererReady(): boolean;
    markRendererReady(): void;
    resetRenderer(): void;
}


export interface ScriptEditorWindowControllerOptions {
    createWindow(): BrowserWindow;
    pagePath: string;
    pendingWork: ScriptEditorPendingWork;
    showOnOpen: boolean;
    getZoomFactor(): number;
    createInitPayload(): Record<string, unknown>;
    shouldPreventClose(): boolean;
    confirmClose(win: BrowserWindow): void;
    onClosed(): void;
}


export interface ScriptEditorWindowController {
    create(): BrowserWindow;
    open(): Promise<BrowserWindow>;
    getWindow(): BrowserWindow | null;
    isPageLoaded(): boolean;
    markRendererReady(sender: WebContents): boolean;
    enqueueInsertion(code: string): void;
    enqueueOpenFile(file: PendingScriptFile): void;
    flush(): void;
    send(channel: string, payload: unknown): boolean;
}


export const createScriptEditorWindowController = function(
    options: ScriptEditorWindowControllerOptions
): ScriptEditorWindowController {
    let win: BrowserWindow | null = null;
    let pageLoaded = false;

    const flush = function(): void {
        if (
            !win
            || win.isDestroyed()
            || !options.pendingWork.isRendererReady()
        ) {
            return;
        }

        options.pendingWork.flush((channel, payload) => {
            win?.webContents.send(channel, payload);
        });
    };
    const create = function(): BrowserWindow {
        if (win && !win.isDestroyed()) {
            return win;
        }

        const nextWindow = options.createWindow();
        win = nextWindow;
        pageLoaded = false;
        options.pendingWork.resetRenderer();
        nextWindow.setMenu(null);
        nextWindow.webContents.setZoomFactor(options.getZoomFactor());
        nextWindow.webContents.on("did-finish-load", () => {
            if (win !== nextWindow || nextWindow.isDestroyed()) {
                return;
            }

            pageLoaded = true;
            options.pendingWork.resetRenderer();
            nextWindow.webContents.setZoomFactor(options.getZoomFactor());
            nextWindow.webContents.send(
                scriptEditorEventChannels.initialize,
                options.createInitPayload()
            );
        });
        nextWindow.on("close", (event) => {
            if (!options.shouldPreventClose()) {
                return;
            }

            event.preventDefault();
            options.confirmClose(nextWindow);
        });
        nextWindow.on("closed", () => {
            if (win !== nextWindow) {
                return;
            }

            pageLoaded = false;
            options.pendingWork.resetRenderer();
            win = null;
            options.onClosed();
        });

        return nextWindow;
    };
    const open = async function(): Promise<BrowserWindow> {
        const nextWindow = create();

        if (!pageLoaded) {
            await nextWindow.loadFile(options.pagePath);
        }

        if (options.showOnOpen) {
            nextWindow.show();
            nextWindow.focus();
        }

        flush();

        return nextWindow;
    };
    const markRendererReady = function(sender: WebContents): boolean {
        if (!win || win.isDestroyed() || sender !== win.webContents) {
            return false;
        }

        options.pendingWork.markRendererReady();
        flush();

        return true;
    };
    const send = function(channel: string, payload: unknown): boolean {
        if (!win || win.isDestroyed()) {
            return false;
        }

        win.webContents.send(channel, payload);

        return true;
    };

    return {
        create,
        open,
        getWindow: function(): BrowserWindow | null {
            return win && !win.isDestroyed() ? win : null;
        },
        isPageLoaded: function(): boolean {
            return pageLoaded;
        },
        markRendererReady,
        enqueueInsertion: options.pendingWork.enqueueInsertion,
        enqueueOpenFile: options.pendingWork.enqueueOpenFile,
        flush,
        send
    };
};

import type { BrowserWindow } from "electron";
import {
    datasetEditorEventChannels
} from "../datasetEditorIpc";


export interface DatasetEditorWindowControllerOptions {
    createWindow(): BrowserWindow;
    pagePath: string;
    getZoomFactor(): number;
    createInitPayload(): Record<string, unknown>;
    listDatasetNames(): Promise<string[]>;
    onLoadError(error: unknown): void;
}


export interface DatasetEditorWindowController {
    create(): BrowserWindow;
    ensureLoaded(): Promise<BrowserWindow>;
    getWindow(): BrowserWindow | null;
    isPageLoaded(): boolean;
    send(channel: string, payload: unknown): boolean;
    setTitle(title: string): boolean;
    showAndFocus(): boolean;
}


export const createDatasetEditorWindowController = function(
    options: DatasetEditorWindowControllerOptions
): DatasetEditorWindowController {
    let win: BrowserWindow | null = null;
    let pageLoaded = false;
    let pageLoadPromise: Promise<void> | null = null;

    const create = function(): BrowserWindow {
        if (win && !win.isDestroyed()) {
            return win;
        }

        const nextWindow = options.createWindow();
        win = nextWindow;
        pageLoaded = false;
        pageLoadPromise = null;
        nextWindow.setMenu(null);
        nextWindow.webContents.setZoomFactor(options.getZoomFactor());
        nextWindow.webContents.on("did-finish-load", () => {
            if (win !== nextWindow || nextWindow.isDestroyed()) {
                return;
            }

            pageLoaded = true;
            nextWindow.webContents.setZoomFactor(options.getZoomFactor());
        });
        nextWindow.on("closed", () => {
            if (win !== nextWindow) {
                return;
            }

            pageLoaded = false;
            pageLoadPromise = null;
            win = null;
        });

        return nextWindow;
    };
    const ensureLoaded = async function(): Promise<BrowserWindow> {
        const nextWindow = create();

        if (pageLoaded) {
            return nextWindow;
        }

        if (!pageLoadPromise) {
            let nextLoadPromise: Promise<void>;

            nextLoadPromise = nextWindow.loadFile(options.pagePath)
                .then(() => {
                    if (nextWindow.isDestroyed() || win !== nextWindow) {
                        return;
                    }

                    pageLoaded = true;
                    nextWindow.webContents.send(
                        datasetEditorEventChannels.init,
                        options.createInitPayload()
                    );

                    void options.listDatasetNames()
                        .then((datasetNames) => {
                            if (
                                nextWindow.isDestroyed()
                                || win !== nextWindow
                            ) {
                                return;
                            }

                            nextWindow.webContents.send(
                                datasetEditorEventChannels.setDatasetList,
                                { datasetNames }
                            );
                        })
                        .catch(() => {});
                })
                .catch((error) => {
                    options.onLoadError(error);
                    throw error;
                })
                .finally(() => {
                    if (pageLoadPromise === nextLoadPromise) {
                        pageLoadPromise = null;
                    }
                });
            pageLoadPromise = nextLoadPromise;
        }

        await pageLoadPromise;

        return nextWindow;
    };
    const send = function(channel: string, payload: unknown): boolean {
        if (!win || win.isDestroyed()) {
            return false;
        }

        win.webContents.send(channel, payload);

        return true;
    };
    const setTitle = function(title: string): boolean {
        if (!win || win.isDestroyed()) {
            return false;
        }

        win.setTitle(title);

        return true;
    };
    const showAndFocus = function(): boolean {
        if (!win || win.isDestroyed()) {
            return false;
        }

        win.show();
        win.focus();

        return true;
    };

    return {
        create,
        ensureLoaded,
        getWindow: function(): BrowserWindow | null {
            return win && !win.isDestroyed() ? win : null;
        },
        isPageLoaded: function(): boolean {
            return pageLoaded;
        },
        send,
        setTitle,
        showAndFocus
    };
};

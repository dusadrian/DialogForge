import type { BrowserWindow } from "electron";

import type {
    RuntimeEventSnapshot
} from "../../runtime/provider-contract/runtimeProvider";
import {
    type PlotViewerState
} from "./plotViewerState";
import {
    createPlotViewerPresentationState
} from "../../base-app/features/plot-viewer/plotViewerPresentationState";
import {
    plotExternalEventChannels
} from "../../base-app/features/plot-viewer/plotExternalIpc";


export interface PlotViewerControllerOptions {
    createWindow(): BrowserWindow;
    pagePath: string;
    showOnOpen: boolean;
    getZoomFactor(): number;
}


export interface PlotViewerController {
    getState(): PlotViewerState;
    getWindow(): BrowserWindow | null;
    open(input: unknown): PlotViewerState;
    presentRuntimeEvents(snapshot: RuntimeEventSnapshot): boolean;
    retireResources(): void;
}


export const createPlotViewerController = function(
    options: PlotViewerControllerOptions
): PlotViewerController {
    let win: BrowserWindow | null = null;
    let readyToShow = false;
    const presentation = createPlotViewerPresentationState();

    const sendState = function(): void {
        if (!win || win.isDestroyed()) {
            return;
        }

        win.webContents.send(plotExternalEventChannels.viewerUpdate, presentation.getState());
    };
    const show = function(): void {
        if (!options.showOnOpen || !win || win.isDestroyed()) {
            return;
        }

        if (readyToShow) {
            win.show();
            win.focus();
        }
    };
    const create = function(): BrowserWindow {
        if (win && !win.isDestroyed()) {
            return win;
        }

        const nextWindow = options.createWindow();
        win = nextWindow;
        readyToShow = false;
        nextWindow.webContents.setZoomFactor(options.getZoomFactor());
        nextWindow.webContents.on("page-title-updated", (event, title) => {
            event.preventDefault();

            if (win === nextWindow && !nextWindow.isDestroyed()) {
                nextWindow.setTitle(title);
            }
        });
        nextWindow.webContents.setWindowOpenHandler(() => {
            return { action: "deny" };
        });
        nextWindow.once("ready-to-show", () => {
            if (win !== nextWindow || nextWindow.isDestroyed()) {
                return;
            }

            readyToShow = true;
            nextWindow.webContents.setZoomFactor(options.getZoomFactor());
            show();
            sendState();
        });
        nextWindow.webContents.on("did-finish-load", () => {
            if (win !== nextWindow || nextWindow.isDestroyed()) {
                return;
            }

            nextWindow.webContents.setZoomFactor(options.getZoomFactor());
            sendState();
        });
        nextWindow.on("closed", () => {
            if (win === nextWindow) {
                win = null;
                readyToShow = false;
            }
        });
        void nextWindow.loadFile(options.pagePath);

        return nextWindow;
    };
    const open = function(input: unknown): PlotViewerState {
        const state = presentation.open(input);

        if (state.status !== "ready") {
            return state;
        }

        create();
        show();
        sendState();

        return state;
    };
    const presentRuntimeEvents = function(
        snapshot: RuntimeEventSnapshot
    ): boolean {
        const state = presentation.presentRuntimeEvents(snapshot);
        if (!state || state.status !== "ready") {
            return false;
        }
        create();
        show();
        sendState();
        return true;
    };

    return {
        getState: function(): PlotViewerState {
            return presentation.getState();
        },
        getWindow: function(): BrowserWindow | null {
            return win && !win.isDestroyed() ? win : null;
        },
        open,
        presentRuntimeEvents,
        retireResources: function(): void {
            presentation.retireImages();
            sendState();
        }
    };
};

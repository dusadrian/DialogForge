import type { BrowserWindow } from "electron";

import type {
    RuntimeEventSnapshot
} from "../../runtime/provider-contract/runtimeProvider";
import {
    createPlotViewerState,
    createWaitingPlotViewerState,
    type PlotViewerState
} from "./plotViewerState";
import {
    plotExternalEventChannels
} from "./plotExternalIpc";


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
}


const latestPlotEvent = function(snapshot: RuntimeEventSnapshot): {
    key: string;
    payload: Record<string, unknown>;
} | null {
    const event = snapshot.events.find((candidate) => {
        return candidate.type === "plot";
    });
    const payload = event?.payload && typeof event.payload === "object"
        ? event.payload as Record<string, unknown>
        : {};
    const url = String(payload.viewerUrl || payload.url || "").trim();

    if (!event || !url) {
        return null;
    }

    return {
        key: [
            String(event.createdAt || ""),
            String(payload.count || ""),
            String(payload.upid || ""),
            url
        ].join("\n"),
        payload: Object.assign({}, payload, {
            url,
            viewerUrl: url
        })
    };
};


export const createPlotViewerController = function(
    options: PlotViewerControllerOptions
): PlotViewerController {
    let win: BrowserWindow | null = null;
    let readyToShow = false;
    let state = createWaitingPlotViewerState();
    let lastPresentedEventKey = "";

    const sendState = function(): void {
        if (!win || win.isDestroyed()) {
            return;
        }

        win.webContents.send(plotExternalEventChannels.viewerUpdate, state);
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
        nextWindow.webContents.on("page-title-updated", (event) => {
            event.preventDefault();
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
        state = createPlotViewerState(input);

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
        const event = latestPlotEvent(snapshot);

        if (!event || event.key === lastPresentedEventKey) {
            return false;
        }

        lastPresentedEventKey = event.key;

        return open(event.payload).status === "ready";
    };

    return {
        getState: function(): PlotViewerState {
            return state;
        },
        getWindow: function(): BrowserWindow | null {
            return win && !win.isDestroyed() ? win : null;
        },
        open,
        presentRuntimeEvents
    };
};

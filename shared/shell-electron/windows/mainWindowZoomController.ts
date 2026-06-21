import {
    BrowserWindow,
    type Input
} from "electron";
import {
    shellWindowEventChannels
} from "./shellWindowIpc";


type ZoomShortcutAction = "in" | "out" | "reset";


export interface MainWindowZoomControllerOptions {
    defaultZoomFactor: number;
    readStoredZoomFactor(): unknown;
    persistZoomFactor(zoomFactor: number): void;
    listWindows?(): BrowserWindow[];
}


export interface MainWindowZoomController {
    initialize(): number;
    getZoomFactor(): number;
    applyZoomFactor(value: unknown): void;
    bindShortcuts(win: BrowserWindow): void;
}


const fontShortcutAction = function(
    input: Input
): ZoomShortcutAction | null {
    const key = String(input.key || "");
    const code = String(input.code || "");

    if (
        input.type !== "keyDown"
        || (!input.meta && !input.control)
        || input.alt
    ) {
        return null;
    }

    if (
        key === "+"
        || key === "="
        || key === "Add"
        || code === "NumpadAdd"
    ) {
        return "in";
    }

    if (
        key === "-"
        || key === "_"
        || key === "Subtract"
        || code === "NumpadSubtract"
    ) {
        return "out";
    }

    if (
        key === "0"
        || code === "Digit0"
        || code === "Numpad0"
    ) {
        return "reset";
    }

    return null;
};


export const createMainWindowZoomController = function(
    options: MainWindowZoomControllerOptions
): MainWindowZoomController {
    const defaultZoomFactor = Number(options.defaultZoomFactor) || 1;
    let zoomFactor = defaultZoomFactor;

    const clampZoomFactor = function(value: unknown): number {
        const next = Number(value);

        if (!Number.isFinite(next)) {
            return defaultZoomFactor;
        }

        return Math.max(0.5, Math.min(3, next));
    };

    const notifyWindow = function(win: BrowserWindow): void {
        if (win.isDestroyed()) {
            return;
        }

        try {
            win.webContents.setZoomFactor(zoomFactor);
            win.webContents.send(
                shellWindowEventChannels.mainZoomFactor,
                { zoomFactor }
            );
        }
        catch {
            // A utility window can close while zoom is being applied.
        }
    };

    const applyZoomFactor = function(value: unknown): void {
        zoomFactor = clampZoomFactor(value);

        const windows = options.listWindows
            ? options.listWindows()
            : BrowserWindow.getAllWindows();

        windows.forEach(notifyWindow);
    };

    const updateFromShortcut = function(
        action: ZoomShortcutAction
    ): void {
        const next = action === "reset"
            ? defaultZoomFactor
            : clampZoomFactor(
                zoomFactor + (action === "in" ? 0.1 : -0.1)
            );

        if (next === zoomFactor && action !== "reset") {
            return;
        }

        applyZoomFactor(next);
        options.persistZoomFactor(zoomFactor);
    };

    return {
        initialize: function(): number {
            zoomFactor = clampZoomFactor(
                options.readStoredZoomFactor()
            );

            return zoomFactor;
        },
        getZoomFactor: function(): number {
            return zoomFactor;
        },
        applyZoomFactor,
        bindShortcuts: function(win: BrowserWindow): void {
            win.webContents.on(
                "before-input-event",
                (event, input) => {
                    const action = fontShortcutAction(input);

                    if (!action) {
                        return;
                    }

                    event.preventDefault();
                    updateFromShortcut(action);
                }
            );
            win.webContents.on("did-finish-load", () => {
                notifyWindow(win);
            });
        }
    };
};

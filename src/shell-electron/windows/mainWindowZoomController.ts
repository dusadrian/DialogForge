import {
    BrowserWindow,
    type Input
} from "electron";
import {
    shellWindowEventChannels
} from "../../base-app/features/main-window/shellWindowIpc";
import {
    readMainZoomMenuAction,
    readMainZoomShortcut,
    type MainZoomShortcutAction as ZoomShortcutAction
} from "../../base-app/features/main-window/mainZoomPolicy";
import { createMainZoomState } from "../../base-app/features/main-window/mainZoomState";


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
    handleMenuCommand(item: { role?: unknown }): boolean;
    bindShortcuts(win: BrowserWindow): void;
}


const fontShortcutAction = function(input: Input): ZoomShortcutAction | null {
    if (input.type !== "keyDown") {
        return null;
    }
    return readMainZoomShortcut({
        key: String(input.key || ""),
        code: String(input.code || ""),
        ctrlCmd: Boolean(input.meta || input.control),
        alt: input.alt
    });
};


export const createMainWindowZoomController = function(
    options: MainWindowZoomControllerOptions
): MainWindowZoomController {
    const notifyWindow = function(win: BrowserWindow): void {
        if (win.isDestroyed()) {
            return;
        }

        try {
            const zoomFactor = zoomState.readZoomFactor();
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

    const deliverZoomFactor = function(): void {
        const windows = options.listWindows
            ? options.listWindows()
            : BrowserWindow.getAllWindows();

        windows.forEach(notifyWindow);
    };

    const zoomState = createMainZoomState({
        defaultZoomFactor: options.defaultZoomFactor,
        readStoredZoomFactor: options.readStoredZoomFactor,
        deliverZoomFactor,
        persistZoomFactor: options.persistZoomFactor
    });

    return {
        initialize: zoomState.initialize,
        getZoomFactor: zoomState.readZoomFactor,
        applyZoomFactor: zoomState.apply,
        handleMenuCommand: function(item): boolean {
            const action = readMainZoomMenuAction(item.role);

            if (!action) {
                return false;
            }

            zoomState.execute(action);
            return true;
        },
        bindShortcuts: function(win: BrowserWindow): void {
            win.webContents.on(
                "before-input-event",
                (event, input) => {
                    const action = fontShortcutAction(input);

                    if (!action) {
                        return;
                    }

                    event.preventDefault();
                    zoomState.execute(action);
                }
            );
            win.webContents.on("did-finish-load", () => {
                notifyWindow(win);
            });
        }
    };
};

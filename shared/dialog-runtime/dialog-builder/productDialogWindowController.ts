import * as path from "path";
import {
    BrowserWindow,
    type BrowserWindowConstructorOptions
} from "electron";
import {
    applySavedWindowState,
    wireWindowStatePersistence
} from "../../shell-electron/windows/windowState";
import type {
    ProductDialogWindowRegistry
} from "./productDialogWindowRegistry";
import type {
    ProductDialogSessionStore
} from "./productDialogSessionStore";
import {
    dialogRuntimeEventChannels
} from "../dialogRuntimeIpc";


export interface ProductDialogDefinition {
    properties?: Record<string, unknown>;
}


export interface ProductDialogWindowControllerOptions<WorkspaceSource> {
    rootDir: string;
    productId: string;
    nativeWindowIconPath?: string;
    windows: ProductDialogWindowRegistry<BrowserWindow>;
    sessions: ProductDialogSessionStore;
    readDialog(dialogId: string): ProductDialogDefinition;
    readWorkspaceData(source?: WorkspaceSource): Promise<unknown>;
    getParentWindow(): BrowserWindow | null;
    windowClosed(dialogId: string): void;
}


export interface ProductDialogWindowController<WorkspaceSource> {
    open(dialogId: string): BrowserWindow;
    refreshWorkspaceData(
        dialogId?: string,
        source?: WorkspaceSource
    ): Promise<void>;
}


export const createProductDialogWindowController = function<WorkspaceSource>(
    options: ProductDialogWindowControllerOptions<WorkspaceSource>
): ProductDialogWindowController<WorkspaceSource> {
    let lastWorkspaceData: unknown = null;
    let workspaceRequestSequence = 0;

    const sendWorkspaceData = function(
        workspaceData: unknown,
        dialogId = ""
    ): void {
        if (dialogId) {
            const target = options.windows.get(dialogId);

            if (target) {
                target.webContents.send(
                    dialogRuntimeEventChannels.incomingData,
                    workspaceData
                );
            }

            return;
        }

        options.windows.forEachLive(function(_id, window): void {
            window.webContents.send(
                dialogRuntimeEventChannels.incomingData,
                workspaceData
            );
        });
    };
    const refreshWorkspaceData = async function(
        dialogId = "",
        source?: WorkspaceSource
    ): Promise<void> {
        const sequence = ++workspaceRequestSequence;
        const workspaceData = await options.readWorkspaceData(source);

        if (sequence < workspaceRequestSequence) {
            if (dialogId && lastWorkspaceData) {
                sendWorkspaceData(lastWorkspaceData, dialogId);
            }

            return;
        }

        lastWorkspaceData = workspaceData;
        sendWorkspaceData(workspaceData, dialogId);
    };
    const open = function(dialogId: string): BrowserWindow {
        const existing = options.windows.focusExisting(dialogId);

        if (existing) {
            return existing;
        }

        const runtimeDialog = options.readDialog(dialogId);
        const properties =
            runtimeDialog.properties
            && typeof runtimeDialog.properties === "object"
                ? runtimeDialog.properties
                : {};
        const width = Math.max(
            200,
            Math.round(Number(properties.width) || 640)
        );
        const height = Math.max(
            120,
            Math.round(Number(properties.height) || 480)
        );
        const settingsPath = path.join(
            options.rootDir,
            "products",
            options.productId,
            "settings/settings.json"
        );
        const windowKey =
            `${options.productId}.dialog.${dialogId}`;
        const parent = options.getParentWindow();
        const baseOptions: BrowserWindowConstructorOptions = {
            width,
            height,
            useContentSize: true,
            resizable: false,
            show: false,
            title: String(properties.title || dialogId),
            parent: parent && !parent.isDestroyed()
                ? parent
                : undefined,
            backgroundColor: "#ffffff",
            icon: options.nativeWindowIconPath || undefined,
            webPreferences: {
                contextIsolation: false,
                nodeIntegration: true
            }
        };
        const windowOptions = applySavedWindowState(
            settingsPath,
            windowKey,
            baseOptions,
            {
                persistSize: false
            }
        );
        const window = new BrowserWindow(windowOptions);

        options.windows.register(dialogId, window);
        wireWindowStatePersistence(
            window,
            settingsPath,
            windowKey,
            {
                persistSize: false
            }
        );
        window.setMenu(null);
        window.loadFile(path.join(
            options.rootDir,
            "shared/base-app/pages/dialogBuilder.html"
        ));
        window.webContents.once("did-finish-load", function(): void {
            window.webContents.send(dialogRuntimeEventChannels.created, {
                dialogID: dialogId,
                data: runtimeDialog,
                lastState: options.sessions.getState(dialogId),
                workspaceData: lastWorkspaceData
            });

            if (lastWorkspaceData) {
                window.webContents.send(
                    dialogRuntimeEventChannels.incomingData,
                    lastWorkspaceData
                );
            }

            void refreshWorkspaceData(dialogId);
        });
        window.once("ready-to-show", function(): void {
            if (!window.isDestroyed()) {
                window.show();
            }
        });
        window.on("closed", function(): void {
            options.windowClosed(dialogId);
        });

        return window;
    };

    return {
        open,
        refreshWorkspaceData
    };
};

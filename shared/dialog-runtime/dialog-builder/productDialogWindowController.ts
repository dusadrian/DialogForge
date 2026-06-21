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
    readInitialWorkspaceData(source?: WorkspaceSource): Promise<unknown>;
    getActiveDatasetName(): string;
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
    let lastWorkspaceSource: WorkspaceSource | undefined;
    let pendingWorkspaceData: Promise<unknown> | null = null;
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
    const withCurrentActiveDataset = function(
        workspaceData: unknown
    ): unknown {
        if (
            !workspaceData
            || typeof workspaceData !== "object"
            || Array.isArray(workspaceData)
        ) {
            return workspaceData;
        }

        return {
            ...workspaceData,
            activeDataset: options.getActiveDatasetName()
        };
    };
    const refreshWorkspaceData = async function(
        dialogId = "",
        source?: WorkspaceSource
    ): Promise<void> {
        if (source !== undefined) {
            if (source !== lastWorkspaceSource) {
                lastWorkspaceData = null;
            }

            lastWorkspaceSource = source;
        }

        const sequence = ++workspaceRequestSequence;
        const request = options.readWorkspaceData(
            source ?? lastWorkspaceSource
        );
        pendingWorkspaceData = request;
        let workspaceData: unknown;

        try {
            workspaceData = await request;
        }
        finally {
            if (pendingWorkspaceData === request) {
                pendingWorkspaceData = null;
            }
        }

        if (sequence < workspaceRequestSequence) {
            if (dialogId && lastWorkspaceData) {
                sendWorkspaceData(lastWorkspaceData, dialogId);
            }

            return;
        }

        lastWorkspaceData = withCurrentActiveDataset(workspaceData);
        sendWorkspaceData(lastWorkspaceData, dialogId);
    };
    const readPreparedWorkspaceData = async function(): Promise<unknown> {
        if (lastWorkspaceData) {
            return lastWorkspaceData;
        }

        if (pendingWorkspaceData) {
            await pendingWorkspaceData;

            if (lastWorkspaceData) {
                return lastWorkspaceData;
            }
        }

        return options.readInitialWorkspaceData(lastWorkspaceSource);
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
                nodeIntegration: true,
                preload: path.join(
                    options.rootDir,
                    "shared/dialog-runtime/dialog-builder/productDialogPreload.js"
                )
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
            const sendCreated = function(workspaceData: unknown): void {
                if (window.isDestroyed()) {
                    return;
                }

                const currentWorkspaceData = withCurrentActiveDataset(
                    workspaceData
                );

                lastWorkspaceData = currentWorkspaceData;
                window.webContents.send(dialogRuntimeEventChannels.created, {
                    dialogID: dialogId,
                    data: runtimeDialog,
                    lastState: options.sessions.getState(dialogId),
                    workspaceData: currentWorkspaceData
                });
                window.webContents.send(
                    dialogRuntimeEventChannels.incomingData,
                    currentWorkspaceData
                );
            };

            void readPreparedWorkspaceData().then(function(
                initialWorkspaceData
            ): void {
                sendCreated(initialWorkspaceData);
            });
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

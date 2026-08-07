import * as path from "path";
import {
    BrowserWindow,
    type BrowserWindowConstructorOptions
} from "electron";
import {
    applySavedWindowState,
    wireWindowStatePersistence
} from "../windows/windowState";
import type {
    ProductDialogWindowRegistry
} from "../../dialog-runtime/dialog-builder/productDialogWindowRegistry";
import type {
    ProductDialogSessionStore
} from "../../dialog-runtime/dialog-builder/productDialogSessionStore";
import {
    dialogRuntimeEventChannels
} from "../../dialog-runtime/dialogRuntimeIpc";
import type {
    ProductDialogDefinition
} from "../../dialog-runtime/dialog-builder/productDialogDefinition";


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
    refreshLanguage(): Promise<void>;
}


/**
 * Size of the element that absorbs the growth, when the dialog declares one.
 * Preserving the window's own width-to-height ratio is not enough for a plot:
 * the fixed controls around it mean the two axes gain different amounts of
 * space, so the drawing keeps its shape while an ever wider gutter opens up
 * beside it. Feeding this size to setAspectRatio as the ratio, with the rest
 * of the layout declared as extra size, keeps the growing element itself at
 * its authored proportions instead.
 */
const readGrowingElementSize = function(
    runtimeDialog: ProductDialogDefinition
): { width: number; height: number } | null {
    const elements =
        runtimeDialog.elements
        && typeof runtimeDialog.elements === "object"
            ? runtimeDialog.elements
            : {};
    const growing = Object.values(elements).find(function(spec): boolean {
        return String(
            (spec as Record<string, unknown>)?.resizeWithDialog
        ) === "true";
    }) as Record<string, unknown> | undefined;

    if (!growing) {
        return null;
    }

    const width = Math.round(Number(growing.width));
    const height = Math.round(Number(growing.height));

    if (!Number.isFinite(width) || !Number.isFinite(height)) {
        return null;
    }

    if (width <= 0 || height <= 0) {
        return null;
    }

    return {
        width,
        height
    };
};


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
    const sendCreated = function(
        window: BrowserWindow,
        dialogId: string,
        runtimeDialog: ProductDialogDefinition,
        workspaceData: unknown
    ): void {
        if (window.isDestroyed()) {
            return;
        }

        const currentWorkspaceData = withCurrentActiveDataset(workspaceData);

        lastWorkspaceData = currentWorkspaceData;
        window.setTitle(String(
            runtimeDialog.properties?.title || dialogId
        ));
        window.webContents.send(dialogRuntimeEventChannels.created, {
            dialogID: dialogId,
            data: runtimeDialog,
            lastState: options.sessions.getState(dialogId),
            workspaceData: currentWorkspaceData
        });
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
        const resizable = properties.resizable === true;
        const preserveAspectRatio = properties.preserveAspectRatio === true;
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
            resizable,
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
                    "src/shell-electron/dialog-runtime/productDialogPreload.js"
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

        if (resizable) {
            // The authored size is the floor. Reading it back from the window
            // keeps the frame decorations out of the useContentSize maths.
            const [openedWidth, openedHeight] = window.getSize();

            window.setMinimumSize(openedWidth, openedHeight);

            if (preserveAspectRatio) {
                const growing = readGrowingElementSize(runtimeDialog);

                if (growing) {
                    window.setAspectRatio(growing.width / growing.height, {
                        width: width - growing.width,
                        height: height - growing.height
                    });
                }
                else {
                    window.setAspectRatio(width / height);
                }
            }
        }

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
            "src/base-app/pages/dialogBuilder.html"
        ));
        window.webContents.once("did-finish-load", function(): void {
            void readPreparedWorkspaceData().then(function(
                initialWorkspaceData
            ): void {
                sendCreated(
                    window,
                    dialogId,
                    runtimeDialog,
                    initialWorkspaceData
                );
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
        refreshWorkspaceData,
        refreshLanguage: async function(): Promise<void> {
            const workspaceData = await readPreparedWorkspaceData();

            options.windows.forEachLive(function(dialogId, window): void {
                sendCreated(
                    window,
                    dialogId,
                    options.readDialog(dialogId),
                    workspaceData
                );
            });
        }
    };
};

import {
    BrowserWindow as BrowserWindowValue,
    dialog
} from "electron";
import type {
    BrowserWindow,
    IpcMain,
    WebContents
} from "electron";

import type {
    DialogDefinition
} from "../../core/contracts/applicationComposition";
import type {
    RuntimeSessionManager
} from "../../runtime/provider-contract/runtimeProvider";
import {
    ProductDialogWindowRegistry
} from "../../dialog-runtime/dialog-builder/productDialogWindowRegistry";
import {
    ProductDialogSessionStore
} from "../../dialog-runtime/dialog-builder/productDialogSessionStore";
import {
    createProductDialogEventController
} from "../../dialog-runtime/dialog-builder/productDialogEventController";
import {
    createProductDialogSourceReader
} from "../../dialog-runtime/dialog-builder/productDialogSourceReader";
import {
    createProductDialogWorkspaceDataReader
} from "../../dialog-runtime/dialog-builder/productDialogWorkspaceData";
import {
    createProductDialogWindowController
} from "./productDialogWindowController";
import {
    createProductDialogIpcController
} from "./productDialogIpcController";


export interface ProductDialogCompositionOptions {
    ipcMain: IpcMain;
    rootDir: string;
    productId: string;
    productRootPath?: string;
    nativeWindowIconPath?: string;
    runtimeSessionManager: RuntimeSessionManager;
    findDefinition(dialogId: string): DialogDefinition | undefined;
    getParentWindow(): BrowserWindow | null;
    publishCommand(command: string): void;
    getLocale(): string;
}


export const createProductDialogComposition = function(
    options: ProductDialogCompositionOptions
) {
    const windows = new ProductDialogWindowRegistry<BrowserWindow>();
    const sessions = new ProductDialogSessionStore();
    const events = createProductDialogEventController({
        windows,
        sessions,
        publishCommand: options.publishCommand
    });
    const readDialog = createProductDialogSourceReader({
        rootDir: options.rootDir,
        productId: options.productId,
        productRootPath: options.productRootPath,
        findDefinition: options.findDefinition,
        getLocale: options.getLocale
    });
    const readWorkspaceData = createProductDialogWorkspaceDataReader(
        options.runtimeSessionManager,
        {
            schemaFirst: true
        }
    );
    const readInitialWorkspaceData = createProductDialogWorkspaceDataReader(
        options.runtimeSessionManager,
        {
            schemaFirst: true
        }
    );
    const windowController = createProductDialogWindowController({
        rootDir: options.rootDir,
        productId: options.productId,
        nativeWindowIconPath: options.nativeWindowIconPath,
        windows,
        sessions,
        readDialog,
        readWorkspaceData,
        readInitialWorkspaceData,
        getActiveDatasetName: function(): string {
            return options.runtimeSessionManager.getActiveDataset().objectName;
        },
        getParentWindow: options.getParentWindow,
        windowClosed: events.windowClosed
    });

    createProductDialogIpcController({
        ipcMain: options.ipcMain,
        windowController,
        eventController: events,
        showMessage: function(request, sender): void {
            // Parent the message box on the dialog that raised it, so it stays
            // attached to the window the user is looking at.
            const senderWindow = sender
                ? BrowserWindowValue.fromWebContents(sender as WebContents)
                : null;
            const parent = senderWindow && !senderWindow.isDestroyed()
                ? senderWindow
                : options.getParentWindow();
            const messageOptions = {
                type: request.type,
                buttons: ["OK"],
                defaultId: 0,
                message: request.message,
                ...(request.detail ? { detail: request.detail } : {})
            };

            void (parent && !parent.isDestroyed()
                ? dialog.showMessageBox(parent, messageOptions)
                : dialog.showMessageBox(messageOptions));
        }
    });

    return {
        windowController
    };
};

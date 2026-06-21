import type {
    BrowserWindow,
    IpcMain
} from "electron";

import type {
    DialogDefinition
} from "../../core/contracts/applicationComposition";
import type {
    RuntimeSessionManager
} from "../../runtime/provider-contract/runtimeProvider";
import {
    ProductDialogWindowRegistry
} from "./productDialogWindowRegistry";
import {
    ProductDialogSessionStore
} from "./productDialogSessionStore";
import {
    createProductDialogEventController
} from "./productDialogEventController";
import {
    createProductDialogSourceReader
} from "./productDialogSourceReader";
import {
    createProductDialogWorkspaceDataReader
} from "./productDialogWorkspaceData";
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
    nativeWindowIconPath?: string;
    runtimeSessionManager: RuntimeSessionManager;
    findDefinition(dialogId: string): DialogDefinition | undefined;
    getParentWindow(): BrowserWindow | null;
    publishCommand(command: string): void;
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
        findDefinition: options.findDefinition
    });
    const readWorkspaceData = createProductDialogWorkspaceDataReader(
        options.runtimeSessionManager
    );
    const windowController = createProductDialogWindowController({
        rootDir: options.rootDir,
        productId: options.productId,
        nativeWindowIconPath: options.nativeWindowIconPath,
        windows,
        sessions,
        readDialog,
        readWorkspaceData,
        getParentWindow: options.getParentWindow,
        windowClosed: events.windowClosed
    });

    createProductDialogIpcController({
        ipcMain: options.ipcMain,
        windowController,
        eventController: events
    });

    return {
        windowController
    };
};

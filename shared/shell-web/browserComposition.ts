import { composeApplication } from "../base-app/bootstrap/composeApplication";
import { resolveProductLocation } from "../base-app/bootstrap/productResolver";
import type {
    ApplicationComposition
} from "../core/contracts/applicationComposition";
import type { HostAdapter } from "../core/contracts/hostAdapter";
import type {
    BrowserAuxiliarySurfaceDefinition
} from "./browserAuxiliarySurfaces";
import { listBrowserAuxiliarySurfaces } from "./browserAuxiliarySurfaces";
import type { BrowserDialogSurfaceController } from "./browserDialogSurface";
import { createBrowserDialogSurfaceController } from "./browserDialogSurface";
import type { BrowserFileAdapter } from "./browserFileAdapter";
import { createBrowserFileAdapter } from "./browserFileAdapter";
import { createBrowserHostAdapter } from "./browserHostAdapter";
import type { BrowserStorageAdapter } from "./browserStorageAdapter";
import { createBrowserStorageAdapter } from "./browserStorageAdapter";


export interface BrowserCompositionOptions {
    rootDir: string;
    productPath?: string;
    productId?: string;
    locale?: string;
    runtime?: string;
    persistedRuntimeProvider?: string;
    hostAdapter?: HostAdapter;
    dialogSurfaceController?: BrowserDialogSurfaceController;
    fileAdapter?: BrowserFileAdapter;
    storageAdapter?: BrowserStorageAdapter;
}


export interface BrowserCompositionResult {
    host: "web";
    hostAdapter: HostAdapter;
    dialogSurfaceController: BrowserDialogSurfaceController;
    fileAdapter: BrowserFileAdapter;
    storageAdapter: BrowserStorageAdapter;
    auxiliarySurfaces: BrowserAuxiliarySurfaceDefinition[];
    composition: ApplicationComposition;
}


export const composeBrowserApplication = function(
    options: BrowserCompositionOptions
): BrowserCompositionResult {
    const location = resolveProductLocation(
        options.rootDir,
        options.productId || "base",
        options.productPath
    );
    const composition = composeApplication({
        rootDir: options.rootDir,
        location,
        locale: options.locale,
        runtime: options.runtime,
        persistedRuntimeProvider: options.persistedRuntimeProvider,
        hostKind: "web"
    });

    return {
        host: "web",
        hostAdapter: options.hostAdapter || createBrowserHostAdapter(),
        dialogSurfaceController:
            options.dialogSurfaceController || createBrowserDialogSurfaceController(),
        fileAdapter: options.fileAdapter || createBrowserFileAdapter(),
        storageAdapter: options.storageAdapter || createBrowserStorageAdapter(),
        auxiliarySurfaces: listBrowserAuxiliarySurfaces(),
        composition
    };
};

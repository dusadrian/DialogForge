import {
    installWebRPackageInstallShim
} from "./webRBootstrap";
import {
    createBrowserWebRRuntime,
    type BrowserWebRModule
} from "./webRBrowserRuntime";
import {
    setWebRWorkingDirectory
} from "./webRFileSystem";
import {
    flushWebROutputQueue
} from "./webRInstallProgressAdapter";
import type {
    RuntimeSessionSnapshot
} from "../../provider-contract/runtimeProvider";
import type {
    WebR
} from "webr";

export interface BrowserWebRStartupOptions {
    baseUrl?: string;
    workingDirectoryPath: string;
    homeDirectoryPath?: string;
    importWebRModule(): Promise<BrowserWebRModule>;
    setStatus(message: string): void;
    mountPackageLibrary(runtime: WebR): Promise<unknown>;
}


export interface BrowserWebRStoppableRuntime {
    close?: () => Promise<unknown> | unknown;
    destroy?: () => Promise<unknown> | unknown;
}


export const createBrowserWebRSessionSnapshot = function(
    status: string,
    message = "",
    connection = "browser"
): RuntimeSessionSnapshot {
    return {
        providerId: "webr",
        status,
        connection,
        message
    };
};


export const startBrowserWebRRuntime = async function(
    options: BrowserWebRStartupOptions
): Promise<WebR> {
    options.setStatus("Loading WebR runtime...");
    const runtime = await createBrowserWebRRuntime({
        baseUrl: options.baseUrl,
        homedir: options.homeDirectoryPath || options.workingDirectoryPath,
        importWebRModule: options.importWebRModule
    }) as WebR;

    options.setStatus("Initializing WebR...");
    await runtime.init();
    await flushWebROutputQueue(runtime);
    await options.mountPackageLibrary(runtime);
    options.setStatus("Preparing WebR workspace...");
    await setWebRWorkingDirectory(runtime, options.workingDirectoryPath);
    await installWebRPackageInstallShim(runtime);
    await flushWebROutputQueue(runtime);

    return runtime;
};


export const stopBrowserWebRRuntime = async function(
    runtime: BrowserWebRStoppableRuntime | null | undefined
): Promise<void> {
    try {
        await runtime?.close?.();
    }
    catch {}

    try {
        await runtime?.destroy?.();
    }
    catch {}
};

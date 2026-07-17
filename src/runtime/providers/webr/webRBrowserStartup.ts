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
import {
    readWebRMessageText,
    type WebROutputMessage
} from "./webROutputMessages";
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
    startQuiet?: boolean;
    writeStartupOutput?(text: string): void;
}


export interface BrowserWebRStoppableRuntime {
    close?: () => Promise<unknown> | unknown;
    destroy?: () => Promise<unknown> | unknown;
}


const readWebRStartupOutput = async function(runtime: WebR): Promise<string> {
    try {
        const messages = await runtime.flush() as WebROutputMessage[];
        const output = messages
            .map(readWebRMessageText)
            .join("\n")
            .trim();

        return output
            .replace(/(?:^|\n)>\s*$/, "")
            .trimEnd();
    }
    catch {
        return "";
    }
};


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
        rArgs: options.startQuiet === true ? ["--quiet"] : [],
        importWebRModule: options.importWebRModule
    }) as WebR;

    options.setStatus("Initializing WebR...");
    await runtime.init();

    if (options.startQuiet === true) {
        await flushWebROutputQueue(runtime);
    }
    else {
        const startupOutput = await readWebRStartupOutput(runtime);

        if (startupOutput) {
            options.writeStartupOutput?.(`${startupOutput}\n\n`);
        }
    }

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

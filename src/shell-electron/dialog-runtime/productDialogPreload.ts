import {
    ipcRenderer
} from "electron";
import * as path from "path";

import {
    invokePlotExternalRoute,
    plotExternalIpcChannels,
    type PlotDataSaveRequest
} from "../../base-app/features/plot-viewer/plotExternalIpc";
import type {
    PlotSaveResult
} from "../../base-app/features/plot-viewer/plotViewerState";
import type {
    ProductDialogRuntimeHostBridge
} from "../../dialog-runtime/dialogRuntimeIpc";


interface ProductDialogGlobal {
    dialogForge?: {
        dialogRuntime?: ProductDialogRuntimeHostBridge;
        loadDialogBuilderPage?: () => void;
        savePlot?: (input: PlotDataSaveRequest) => Promise<PlotSaveResult>;
    };
}


const dialogRuntime: ProductDialogRuntimeHostBridge = {
    sendTo: function(window, channel, ...args): void {
        const target = String(window || "all");

        if (target === "main") {
            ipcRenderer.send(channel, ...args);
            return;
        }

        ipcRenderer.send("send-to", target, channel, ...args);
    },
    invoke: function(channel, ...args): Promise<unknown> {
        return ipcRenderer.invoke(channel, ...args);
    },
    on: function(channel, listener): void {
        ipcRenderer.on(channel, (_event, ...args) => {
            listener(...args);
        });
    },
    once: function(channel, listener): void {
        ipcRenderer.once(channel, (_event, ...args) => {
            listener(...args);
        });
    }
};


const readElectronModuleCandidates = function(relativePath: string): string[] {
    const resourcesPath = String(process.resourcesPath || "");

    return [
        path.join(process.cwd(), "dist", relativePath),
        resourcesPath
            ? path.join(resourcesPath, "app.asar", relativePath)
            : "",
        path.join(__dirname, "..", "..", relativePath.replace(/^src\//, ""))
    ].filter(Boolean);
};


const requireFirstElectronModule = function(
    relativePath: string,
    errorPrefix: string
): unknown {
    let lastError = "";

    for (const candidate of readElectronModuleCandidates(relativePath)) {
        try {
            return require(candidate);
        }
        catch (error) {
            lastError = error instanceof Error
                ? error.message
                : String(error);
        }
    }

    console.error(`${errorPrefix} loader failed:`, lastError);
    return null;
};


const registerElectronProfileCustomJSLoader = function(): void {
    const loader = requireFirstElectronModule(
        "src/shell-electron/dialog-runtime/electronProfileCustomJSLoader.js",
        "DIALOG-PROFILE"
    ) as { registerElectronProfileCustomJSModule?: () => void } | null;

    loader?.registerElectronProfileCustomJSModule?.();
};


const loadDialogBuilderPage = function(): void {
    registerElectronProfileCustomJSLoader();
    void requireFirstElectronModule(
        "src/dialog-runtime/renderer/modules/dialogBuilderInterface.js",
        "DIALOG-BUILDER"
    );
};


const target = globalThis as ProductDialogGlobal;
target.dialogForge = {
    ...(target.dialogForge || {}),
    dialogRuntime,
    loadDialogBuilderPage,
    savePlot: function(input: PlotDataSaveRequest): Promise<PlotSaveResult> {
        return invokePlotExternalRoute(
            ipcRenderer,
            plotExternalIpcChannels.savePlot,
            input
        );
    }
};

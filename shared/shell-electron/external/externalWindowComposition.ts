import * as path from "path";
import type {
    Clipboard,
    Dialog,
    IpcMain,
    Shell
} from "electron";

import type {
    HelpTopicRequest,
    HelpTopicResult,
    RuntimeSessionManager,
    TranscriptEvent,
    VisibleCommandRequest
} from "../../runtime/provider-contract/runtimeProvider";
import {
    createHelpTopicRequest
} from "../../runtime/help/helpProtocol";
import {
    buildHelpChooserDocument
} from "../../runtime/help/helpChooserDocument";
import {
    createHelpIpcController
} from "../../runtime/help/helpIpcController";
import {
    createPlotViewerWindowFactory
} from "./plotViewerWindowFactory";
import {
    createPlotViewerController
} from "./plotViewerController";
import type {
    PlotDownloadController
} from "./plotDownloadController";
import {
    createPlotExternalIpcController
} from "./plotExternalIpcController";
import {
    createHelpWindowFactory
} from "./helpWindowFactory";
import {
    createHelpWindowController
} from "./helpWindowController";
import {
    createDevDiagnosticsWindowController
} from "../windows/devDiagnosticsWindowController";


export interface ExternalWindowCompositionOptions {
    ipcMain: IpcMain;
    shell: Shell;
    dialog: Dialog;
    clipboard: Clipboard;
    downloadsPath: string;
    rootDir: string;
    productId: string;
    settingsPath: string;
    nativeWindowIconPath?: string;
    showOnOpen: boolean;
    getZoomFactor(): number;
    plotDownloadController: PlotDownloadController;
    runtimeSessionManager: Pick<RuntimeSessionManager, "readHelpTopic">;
    startHelpServer(): Promise<number>;
    fetchHelpPage(value: unknown): Promise<unknown>;
    executeVisibleCommand(
        request: VisibleCommandRequest
    ): Promise<TranscriptEvent[]>;
}


export const createExternalWindowComposition = function(
    options: ExternalWindowCompositionOptions
) {
    let helpDocumentState = {
        title: "R Help",
        body: ""
    };
    const createPlotViewerWindow = createPlotViewerWindowFactory({
        rootDir: options.rootDir,
        productId: options.productId,
        settingsPath: options.settingsPath,
        nativeWindowIconPath: options.nativeWindowIconPath
    });
    const plotViewerController = createPlotViewerController({
        createWindow: createPlotViewerWindow,
        pagePath: path.join(
            options.rootDir,
            "shared/base-app/pages/plotViewer.html"
        ),
        showOnOpen: options.showOnOpen,
        getZoomFactor: options.getZoomFactor
    });

    createPlotExternalIpcController({
        ipcMain: options.ipcMain,
        shell: options.shell,
        dialog: options.dialog,
        clipboard: options.clipboard,
        downloadsPath: options.downloadsPath,
        plotViewerController,
        plotDownloadController: options.plotDownloadController
    });

    const createHelpWindow = createHelpWindowFactory({
        rootDir: options.rootDir,
        productId: options.productId,
        settingsPath: options.settingsPath,
        nativeWindowIconPath: options.nativeWindowIconPath
    });
    const helpWindowController = createHelpWindowController({
        createWindow: createHelpWindow,
        showOnOpen: options.showOnOpen
    });

    const openHelpTopic = async function(
        input: Partial<HelpTopicRequest>
    ): Promise<HelpTopicResult> {
        const request = createHelpTopicRequest(input || {});
        const result = await options.runtimeSessionManager.readHelpTopic(request);
        const title = result.title || result.topic || "R Help";
        const hasBody = result.status === "ready" && result.body;
        const hasChooser = result.status === "ready"
            && Array.isArray(result.matches)
            && result.matches.length > 0;
        const hasPath = result.status === "ready" && result.path;

        if (hasBody || hasChooser || hasPath) {
            let sourceUrl = "";
            let chooserBody = "";

            if (hasChooser || (!hasBody && hasPath)) {
                const port = await options.startHelpServer();
                const toHelpUrl = function(pathValue: string): string {
                    const helpPath = String(pathValue || "");

                    return `http://127.0.0.1:${port}`
                        + (helpPath.startsWith("/") ? helpPath : `/${helpPath}`);
                };

                sourceUrl = result.path ? toHelpUrl(result.path) : "";
                chooserBody = hasChooser
                    ? buildHelpChooserDocument(result, toHelpUrl)
                    : "";
            }

            helpDocumentState = {
                title: "R Help - " + title,
                body: hasBody ? result.body : chooserBody
            };

            const helpPagePath = path.join(
                options.rootDir,
                "shared/base-app/pages/help.html"
            );
            const helpPageUrl = new URL(`file://${helpPagePath}`);

            if (hasBody) {
                helpPageUrl.searchParams.set(
                    "doc",
                    Buffer.from(result.body, "utf8").toString("base64")
                );
                if (sourceUrl) {
                    helpPageUrl.searchParams.set("base", sourceUrl);
                }
            } else if (sourceUrl) {
                helpPageUrl.searchParams.set("src", sourceUrl);
            } else {
                helpPageUrl.searchParams.set(
                    "doc",
                    Buffer.from(
                        chooserBody || result.body || "",
                        "utf8"
                    ).toString("base64")
                );
            }

            helpPageUrl.searchParams.set("title", "R Help");

            await helpWindowController.load(
                helpPageUrl.toString(),
                helpDocumentState.title
            );
        }

        return result;
    };

    createHelpIpcController({
        ipcMain: options.ipcMain,
        runtimeSessionManager: options.runtimeSessionManager,
        getHelpDocument: function() {
            return helpDocumentState;
        },
        openHelpTopic,
        executeVisibleCommand: options.executeVisibleCommand,
        fetchRHelpPage: options.fetchHelpPage
    });

    const devDiagnosticsWindowController =
        createDevDiagnosticsWindowController({
            rootDir: options.rootDir,
            productId: options.productId,
            settingsPath: options.settingsPath,
            nativeWindowIconPath: options.nativeWindowIconPath,
            showOnOpen: options.showOnOpen
        });

    return {
        plotViewerController,
        openHelpTopic,
        createDevDiagnosticsWindow: devDiagnosticsWindowController.open
    };
};

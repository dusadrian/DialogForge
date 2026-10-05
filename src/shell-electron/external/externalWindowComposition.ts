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
    VisibleCommandRequest
} from "../../runtime/provider-contract/runtimeProvider";
import type { RuntimeCommandResult } from "../../runtime/commands/runtimeCommandReceipt";
import { createHelpRequestOwner } from "../../runtime/help/helpRequestOwner";
import {
    createHelpTopicRequest, createHelpTopicResult
} from "../../runtime/help/helpProtocol";
import {
    createHelpViewerParameters,
    createHelpViewerOpenEntry
} from "../../runtime/help/helpViewerDocument";
import {
    createRHelpTopicTitle,
    createRHelpTopicPresentation,
    createRHelpHomeTopicResult,
    rHelpTitle
} from "../../runtime/providers/r/help/rHelpPresentation";
import {
    createHelpIpcController
} from "./helpIpcController";
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
    ): Promise<RuntimeCommandResult>;
}


export const createExternalWindowComposition = function(
    options: ExternalWindowCompositionOptions
) {
    const helpRequests = createHelpRequestOwner();
    let helpDocumentState = {
        title: rHelpTitle,
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
            "src/base-app/pages/plotViewer.html"
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
        showOnOpen: options.showOnOpen,
        onClose: helpRequests.retire
    });

    const openHelpTopic = async function(
        input: Partial<HelpTopicRequest>
    ): Promise<HelpTopicResult> {
        const isCurrent = helpRequests.begin();
        const request = createHelpTopicRequest(input || {});
        const result = request.kind === "home"
            ? createRHelpHomeTopicResult()
            : await options.runtimeSessionManager.readHelpTopic(request);
        await presentHelpResult(result, request, isCurrent);
        return result;
    };

    const presentHelpResult = async function(
        result: HelpTopicResult,
        request: Partial<HelpTopicRequest>,
        isCurrent: () => boolean
    ): Promise<void> {
        if (!isCurrent()) {
            return;
        }
        let presentation = createRHelpTopicPresentation(result, request);

        if (presentation.available) {
            if (presentation.needsResources) {
                const port = await options.startHelpServer();
                const toHelpUrl = function(pathValue: string): string {
                    const helpPath = String(pathValue || "");

                    return `http://127.0.0.1:${port}`
                        + (helpPath.startsWith("/") ? helpPath : `/${helpPath}`);
                };

                presentation = createRHelpTopicPresentation(result, request, toHelpUrl);
            }

            if (!isCurrent()) {
                return;
            }
            helpDocumentState = {
                title: createRHelpTopicTitle(presentation.title, " - "),
                body: presentation.html
            };

            const helpPagePath = path.join(
                options.rootDir,
                "src/base-app/pages/help.html"
            );
            const helpPageUrl = new URL(`file://${helpPagePath}`);
            const viewerDocument = {
                title: rHelpTitle,
                sourceUrl: presentation.sourceUrl,
                html: presentation.html,
                baseUrl: presentation.sourceUrl,
                topic: presentation.topic,
                packageName: presentation.packageName
            };
            helpPageUrl.search = createHelpViewerParameters(viewerDocument).toString();

            const openedInExistingWindow = await helpWindowController.openEntry(
                createHelpViewerOpenEntry(viewerDocument),
                helpDocumentState.title,
                isCurrent
            );

            if (openedInExistingWindow) {
                return;
            }

            if (!isCurrent()) {
                return;
            }
            await helpWindowController.load(
                helpPageUrl.toString(),
                helpDocumentState.title,
                isCurrent
            );
        }

    };

    const openRHelpPage = async function(
        helpPath: string, isCurrent: () => boolean
    ): Promise<void> {
        const match = helpPath.match(/^\/library\/([^/]+)\/html\/([^/]+)[.]html/);
        await presentHelpResult(createHelpTopicResult({
            status: "ready", kind: "topic", title: rHelpTitle,
            topic: match?.[2] || rHelpTitle, path: helpPath,
            body: "", matches: [], message: "R browser callback."
        }), { package: match?.[1] || "" }, isCurrent);
    };

    createHelpIpcController({
        ipcMain: options.ipcMain,
        runtimeSessionManager: options.runtimeSessionManager,
        getHelpDocument: function() {
            return helpDocumentState;
        },
        openHelpTopic,
        retireHelpRequest: helpRequests.retire,
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
        openRHelpPage,
        helpRequests,
        getHelpWindow: helpWindowController.getWindow,
        createDevDiagnosticsWindow: devDiagnosticsWindowController.open
    };
};

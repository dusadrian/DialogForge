import * as fs from "fs";
import * as path from "path";
import {
    nativeImage
} from "electron";
import type {
    Clipboard,
    Dialog,
    IpcMain,
    IpcMainInvokeEvent,
    Shell
} from "electron";

import {
    createExternalUrlOpenRequest
} from "./externalUrl";
import type {
    PlotDownloadController
} from "./plotDownloadController";
import type {
    PlotViewerController
} from "./plotViewerController";
import {
    createPlotCopyResult,
    createPlotSaveRequest,
    createPlotSaveResult
} from "./plotViewerState";
import {
    plotExternalIpcChannels
} from "./plotExternalIpc";


export interface PlotExternalIpcControllerOptions {
    ipcMain: IpcMain;
    shell: Shell;
    dialog: Dialog;
    clipboard: Clipboard;
    downloadsPath: string;
    plotViewerController: PlotViewerController;
    plotDownloadController: PlotDownloadController;
}


const plotFormatLabels = {
    png: "PNG Image",
    jpeg: "JPEG Image",
    svg: "SVG Image",
    pdf: "PDF Document",
    tiff: "TIFF Image"
};


export const createPlotExternalIpcController = function(
    options: PlotExternalIpcControllerOptions
): void {
    options.ipcMain.handle(plotExternalIpcChannels.openExternalUrl, async (
        _event: IpcMainInvokeEvent,
        url: string
    ) => {
        const request = createExternalUrlOpenRequest(url);

        if (request.status !== "ready") {
            return request;
        }

        await options.shell.openExternal(request.url);

        return request;
    });

    options.ipcMain.handle(plotExternalIpcChannels.openPlotViewer, async (
        _event: IpcMainInvokeEvent,
        url: string
    ) => {
        return options.plotViewerController.open(url);
    });

    options.ipcMain.handle(plotExternalIpcChannels.savePlot, async (
        _event: IpcMainInvokeEvent,
        input: {
            url?: string;
            format?: "png" | "jpeg" | "svg" | "pdf" | "tiff";
        }
    ) => {
        const request = createPlotSaveRequest(input || {});
        const urlRequest = createExternalUrlOpenRequest(request.url);

        if (urlRequest.status !== "ready") {
            return createPlotSaveResult({
                status: "invalid",
                message: urlRequest.message
            });
        }

        const extension = request.format;
        const saveOptions = {
            title: "Save Plot as " + request.format.toUpperCase(),
            defaultPath: path.join(options.downloadsPath, "plot." + extension),
            filters: [
                { name: plotFormatLabels[request.format], extensions: [extension] }
            ]
        };
        const plotWindow = options.plotViewerController.getWindow();
        const target = plotWindow
            ? await options.dialog.showSaveDialog(plotWindow, saveOptions)
            : await options.dialog.showSaveDialog(saveOptions);

        if (target.canceled || !target.filePath) {
            return createPlotSaveResult({
                status: "canceled",
                message: "Plot save was canceled."
            });
        }

        const extensionName = "." + extension;
        const filePath = path.extname(target.filePath).toLowerCase() === extensionName
            ? target.filePath
            : target.filePath + extensionName;

        try {
            await fs.promises.writeFile(
                filePath,
                await options.plotDownloadController.download(urlRequest.url)
            );

            return createPlotSaveResult({
                status: "saved",
                filePath,
                message: "Plot saved."
            });
        } catch (error) {
            return createPlotSaveResult({
                status: "failed",
                message: error instanceof Error
                    ? error.message
                    : String(error || "plot-save-failed")
            });
        }
    });

    options.ipcMain.handle(plotExternalIpcChannels.copyPlot, async (
        _event: IpcMainInvokeEvent,
        url: string
    ) => {
        const request = createExternalUrlOpenRequest(url);

        if (request.status !== "ready") {
            return createPlotCopyResult({
                status: "invalid",
                message: request.message
            });
        }

        try {
            const image = nativeImage.createFromBuffer(
                await options.plotDownloadController.download(request.url)
            );

            if (image.isEmpty()) {
                return createPlotCopyResult({
                    status: "failed",
                    message: "Downloaded plot is not a supported image."
                });
            }

            options.clipboard.writeImage(image);

            return createPlotCopyResult({
                status: "copied",
                message: "Plot copied to clipboard."
            });
        } catch (error) {
            return createPlotCopyResult({
                status: "failed",
                message: error instanceof Error
                    ? error.message
                    : String(error || "plot-copy-failed")
            });
        }
    });
};

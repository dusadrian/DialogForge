import {
    createCanceledPlotSaveResult,
    createCopiedPlotCopyResult,
    createFailedPlotCopyResult,
    createFailedPlotSaveResult,
    createSavedPlotSaveResult,
    createPlotSaveResult,
    type PlotCopyResult,
    type PlotSaveResult
} from "./plotViewerState";
import type { ResourceClient, ResourceBufferResult } from "../../../core/contracts/hostAdapter";


export const readPlotExportResource = async function(
    resourceClient: ResourceClient,
    url: string
): Promise<ResourceBufferResult> {
    const response = await resourceClient.loadBuffer(url, { redirect: "follow" });

    if (!response.ok) {
        throw new Error("plot-download-http-" + response.status);
    }

    return response;
};


export const savePlotThroughHost = async function(
    saveFile: () => Promise<string | null | { status: "requested" }>,
    isCanceledError?: (error: unknown) => boolean
): Promise<PlotSaveResult> {
    try {
        const filePath = await saveFile();

        if (filePath === null) {
            return createCanceledPlotSaveResult();
        }

        if (typeof filePath !== "string") {
            return createPlotSaveResult({
                status: "requested",
                message: "Plot download requested; completion cannot be confirmed."
            });
        }

        return createSavedPlotSaveResult(filePath);
    }
    catch (error) {
        if (isCanceledError?.(error)) {
            return createCanceledPlotSaveResult();
        }

        return createFailedPlotSaveResult(error);
    }
};


export const copyPlotThroughHost = async function(
    copyImage: () => Promise<void>
): Promise<PlotCopyResult> {
    try {
        await copyImage();

        return createCopiedPlotCopyResult();
    }
    catch (error) {
        return createFailedPlotCopyResult(error);
    }
};

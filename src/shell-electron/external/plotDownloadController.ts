import {
    createExternalUrlOpenRequest
} from "./externalUrl";
import type {
    ResourceClient
} from "../../core/contracts/hostAdapter";


export interface PlotDownloadController {
    download(rawUrl: string): Promise<Buffer>;
}


export interface PlotDownloadControllerOptions {
    resourceClient: ResourceClient;
}


export const createPlotDownloadController = function(
    options: PlotDownloadControllerOptions
): PlotDownloadController {
    return {
        download: async function(rawUrl: string): Promise<Buffer> {
            const request = createExternalUrlOpenRequest(rawUrl);

            if (request.status !== "ready") {
                throw new Error(request.message || "invalid-plot-url");
            }

            const response = await options.resourceClient.loadBuffer(request.url, {
                redirect: "follow"
            });

            if (!response.ok) {
                throw new Error("plot-download-http-" + response.status);
            }

            return Buffer.from(response.body);
        }
    };
};

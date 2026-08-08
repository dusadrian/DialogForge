import type {
    ExternalUrlOpenRequest
} from "../external-url/externalUrl";
import type {
    PlotCopyResult,
    PlotSaveRequest,
    PlotSaveResult,
    PlotViewerState
} from "./plotViewerState";
import {
    invokeTypedIpcRoute,
    type IpcInvokeTransport
} from "../../../core/ipc/typedIpc";


export const plotExternalIpcChannels = {
    openExternalUrl: "base-app:openExternalUrl",
    openPlotViewer: "base-app:openPlotViewer",
    savePlot: "base-app:savePlot",
    copyPlot: "base-app:copyPlot"
} as const;


export const plotExternalEventChannels = {
    viewerUpdate: "base-app:plot-viewer-update"
} as const;


export interface PlotDataSaveRequest extends Partial<PlotSaveRequest> {
    data?: Uint8Array;
    fileName?: string;
}


interface PlotExternalIpcRoutes {
    "base-app:openExternalUrl": {
        input: [string];
        result: ExternalUrlOpenRequest;
    };
    "base-app:openPlotViewer": {
        input: [string];
        result: PlotViewerState;
    };
    "base-app:savePlot": {
        input: [PlotDataSaveRequest];
        result: PlotSaveResult;
    };
    "base-app:copyPlot": {
        input: [string];
        result: PlotCopyResult;
    };
}


export const invokePlotExternalRoute = function<
    Channel extends keyof PlotExternalIpcRoutes & string
>(
    transport: IpcInvokeTransport,
    channel: Channel,
    ...args: PlotExternalIpcRoutes[Channel]["input"]
): Promise<PlotExternalIpcRoutes[Channel]["result"]> {
    return invokeTypedIpcRoute<
        PlotExternalIpcRoutes[Channel]["input"],
        PlotExternalIpcRoutes[Channel]["result"]
    >(transport, channel, ...args);
};

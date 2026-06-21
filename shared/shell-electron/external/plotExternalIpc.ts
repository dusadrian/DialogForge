import type {
    ExternalUrlOpenRequest
} from "./externalUrl";
import type {
    PlotCopyResult,
    PlotSaveRequest,
    PlotSaveResult,
    PlotViewerState
} from "./plotViewerState";
import {
    invokeTypedIpcRoute,
    type IpcInvokeTransport
} from "../../core/ipc/typedIpc";


export const plotExternalIpcChannels = {
    openExternalUrl: "base-app:openExternalUrl",
    openPlotViewer: "base-app:openPlotViewer",
    savePlot: "base-app:savePlot",
    copyPlot: "base-app:copyPlot"
} as const;


export const plotExternalEventChannels = {
    viewerUpdate: "base-app:plot-viewer-update"
} as const;


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
        input: [Partial<PlotSaveRequest>];
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

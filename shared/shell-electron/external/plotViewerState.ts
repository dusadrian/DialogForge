import type { ExternalUrlOpenRequest } from "./externalUrl";
import { createExternalUrlOpenRequest } from "./externalUrl";


export type PlotViewerStatus = "ready" | "invalid" | "waiting";


export interface PlotViewerState {
    status: PlotViewerStatus;
    url: string;
    count: number;
    upid: string;
    message: string;
    updatedAt: string;
}


export interface PlotSaveRequest {
    url: string;
    format: "png" | "jpeg" | "svg" | "pdf" | "tiff";
}


export interface PlotSaveResult {
    status: "saved" | "canceled" | "invalid" | "failed";
    filePath: string;
    message: string;
}


export interface PlotCopyResult {
    status: "copied" | "invalid" | "failed";
    message: string;
}


export const createWaitingPlotViewerState = function(): PlotViewerState {
    return {
        status: "waiting",
        url: "",
        count: 0,
        upid: "",
        message: "Waiting for a plot.",
        updatedAt: new Date(0).toISOString()
    };
};


export const createPlotViewerState = function(input: unknown, now = new Date()): PlotViewerState {
    const source = input && typeof input === "object"
        ? input as Record<string, unknown>
        : {};
    const rawUrl = typeof input === "string"
        ? input
        : source.viewerUrl || source.url;
    const request: ExternalUrlOpenRequest = createExternalUrlOpenRequest(rawUrl);
    const rawCount = Number(source.count || 0);

    return {
        status: request.status === "ready" ? "ready" : "invalid",
        url: request.url,
        count: request.status === "ready"
            ? Math.max(1, Number.isFinite(rawCount) ? Math.floor(rawCount) : 0)
            : 0,
        upid: request.status === "ready"
            ? String(source.upid || "").trim()
            : "",
        message: request.status === "ready" ? "Plot viewer is ready." : request.message,
        updatedAt: now.toISOString()
    };
};


export const createPlotSaveRequest = function(input: Partial<PlotSaveRequest>): PlotSaveRequest {
    const rawFormat = String(input.format || "png").trim().toLowerCase();
    const format = rawFormat === "jpeg" || rawFormat === "svg" || rawFormat === "pdf" || rawFormat === "tiff"
        ? rawFormat
        : "png";

    return {
        url: String(input.url || "").trim(),
        format
    };
};


export const createPlotSaveResult = function(input: Partial<PlotSaveResult>): PlotSaveResult {
    return {
        status: input.status || "failed",
        filePath: input.filePath || "",
        message: input.message || ""
    };
};


export const createPlotCopyResult = function(input: Partial<PlotCopyResult>): PlotCopyResult {
    return {
        status: input.status || "failed",
        message: input.message || ""
    };
};


export const plotViewerStateApi = {
    createPlotCopyResult,
    createPlotSaveRequest,
    createPlotSaveResult,
    createPlotViewerState,
    createWaitingPlotViewerState
};

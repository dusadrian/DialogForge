import type { ExternalUrlOpenRequest } from "../external-url/externalUrl";
import { createExternalUrlOpenRequest } from "../external-url/externalUrl";


export type PlotViewerStatus = "ready" | "invalid" | "waiting";


export interface PlotViewerState {
    status: PlotViewerStatus;
    url: string;
    count: number;
    upid: string;
    message: string;
    updatedAt: string;
    urls?: string[];
    renderToken?: number;
    i18n?: Record<string, string>;
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


export interface PlotViewerPayload extends PlotViewerState {
    urls: string[];
}


export interface PlotSaveFormatInfo {
    format: PlotSaveRequest["format"];
    mimeType: string;
    label: string;
    extension: string;
}


const plotSaveFormats: Record<PlotSaveRequest["format"], PlotSaveFormatInfo> = {
    png: {
        format: "png",
        mimeType: "image/png",
        label: "PNG image",
        extension: ".png"
    },
    jpeg: {
        format: "jpeg",
        mimeType: "image/jpeg",
        label: "JPEG image",
        extension: ".jpeg"
    },
    svg: {
        format: "svg",
        mimeType: "image/svg+xml",
        label: "SVG image",
        extension: ".svg"
    },
    pdf: {
        format: "pdf",
        mimeType: "application/pdf",
        label: "PDF document",
        extension: ".pdf"
    },
    tiff: {
        format: "tiff",
        mimeType: "image/tiff",
        label: "TIFF image",
        extension: ".tiff"
    }
};


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


export const createPlotViewerState = function(
    input: unknown,
    now = new Date()
): PlotViewerState {
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


export const createPlotViewerPayload = function(
    urls: string[],
    renderToken?: number
): PlotViewerPayload {
    const entries = Array.isArray(urls) ? urls.map(String) : [];
    const payload = createPlotViewerState({
        url: entries[entries.length - 1] || "",
        count: entries.length
    });

    return Object.assign({}, payload, {
        message: "",
        urls: entries,
        count: entries.length,
        renderToken
    });
};


export const createEmptyPlotViewerPayload = function(
    urls: unknown
): PlotViewerPayload {
    const entries = Array.isArray(urls) ? urls.map(String) : [];

    if (!entries.length) {
        return Object.assign({}, createWaitingPlotViewerState(), {
            message: "No WebR plot image was captured for the last command.",
            urls: entries
        });
    }

    return Object.assign({}, createPlotViewerState({
        url: entries[entries.length - 1] || "",
        count: entries.length
    }), {
        message: "",
        urls: entries,
        count: entries.length
    });
};


export const createPlotSaveRequest = function(
    input: Partial<Record<keyof PlotSaveRequest, unknown>>
): PlotSaveRequest {
    const rawFormat = String(input.format || "png").trim().toLowerCase();
    const format = rawFormat === "jpeg" || rawFormat === "svg" || rawFormat === "pdf" || rawFormat === "tiff"
        ? rawFormat
        : "png";

    return {
        url: String(input.url || "").trim(),
        format
    };
};


export const createPlotSaveResult = function(
    input: Partial<PlotSaveResult>
): PlotSaveResult {
    return {
        status: input.status || "failed",
        filePath: input.filePath || "",
        message: input.message || ""
    };
};


export const getPlotSaveFormatInfo = function(
    value: unknown
): PlotSaveFormatInfo {
    const request = createPlotSaveRequest({ format: value });

    return plotSaveFormats[request.format];
};


export const createPlotSaveFileName = function(format: unknown): string {
    const info = getPlotSaveFormatInfo(format);

    return `plot.${info.format}`;
};


export const createIndexedPlotSaveFileName = function(
    index: unknown,
    format: unknown
): string {
    const info = getPlotSaveFormatInfo(format);
    const position = Math.max(1, Number(index || 0) + 1);

    return `plot-${position}.${info.format}`;
};


export const ensurePlotSaveFileExtension = function(
    filePath: string,
    format: unknown
): string {
    const info = getPlotSaveFormatInfo(format);
    const extension = `.${info.format}`;

    return String(filePath || "").toLowerCase().endsWith(extension)
        ? filePath
        : `${filePath}${extension}`;
};


export const createInvalidPlotSaveResult = function(): PlotSaveResult {
    return createPlotSaveResult({
        status: "invalid",
        filePath: "",
        message: "No plot URL was provided."
    });
};


export const createSavedPlotSaveResult = function(
    filePath = ""
): PlotSaveResult {
    return createPlotSaveResult({
        status: "saved",
        filePath,
        message: "Plot saved."
    });
};


export const createCanceledPlotSaveResult = function(): PlotSaveResult {
    return createPlotSaveResult({
        status: "canceled",
        filePath: "",
        message: "Plot save was canceled."
    });
};


export const createFailedPlotSaveResult = function(
    error: unknown
): PlotSaveResult {
    return createPlotSaveResult({
        status: "failed",
        filePath: "",
        message: error instanceof Error ? error.message : String(error)
    });
};


export const createPlotCopyResult = function(
    input: Partial<PlotCopyResult>
): PlotCopyResult {
    return {
        status: input.status || "failed",
        message: input.message || ""
    };
};


export const createInvalidPlotCopyResult = function(): PlotCopyResult {
    return createPlotCopyResult({
        status: "invalid",
        message: "No plot URL was provided."
    });
};


export const createCopiedPlotCopyResult = function(): PlotCopyResult {
    return createPlotCopyResult({
        status: "copied",
        message: "Plot copied to clipboard."
    });
};


export const createFailedPlotCopyResult = function(error: unknown): PlotCopyResult {
    return createPlotCopyResult({
        status: "failed",
        message: error instanceof Error ? error.message : String(error)
    });
};


export const plotViewerStateApi = {
    createCanceledPlotSaveResult,
    createCopiedPlotCopyResult,
    createFailedPlotCopyResult,
    createFailedPlotSaveResult,
    createInvalidPlotCopyResult,
    createInvalidPlotSaveResult,
    createIndexedPlotSaveFileName,
    createEmptyPlotViewerPayload,
    createPlotCopyResult,
    createPlotSaveFileName,
    createPlotSaveRequest,
    createPlotSaveResult,
    createPlotViewerPayload,
    createPlotViewerState,
    createSavedPlotSaveResult,
    createWaitingPlotViewerState,
    ensurePlotSaveFileExtension,
    getPlotSaveFormatInfo
};

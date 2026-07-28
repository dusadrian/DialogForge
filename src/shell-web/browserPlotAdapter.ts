import {
    createCanceledPlotSaveResult,
    createCopiedPlotCopyResult,
    createFailedPlotCopyResult,
    createFailedPlotSaveResult,
    createEmptyPlotViewerPayload,
    createInvalidPlotCopyResult,
    createInvalidPlotSaveResult,
    createIndexedPlotSaveFileName,
    createPlotViewerPayload,
    createPlotSaveRequest,
    createPlotSaveFileName,
    createSavedPlotSaveResult,
    getPlotSaveFormatInfo,
    type PlotViewerPayload,
    type PlotCopyResult,
    type PlotSaveResult
} from "../base-app/features/plot-viewer/plotViewerState";
import type { BrowserFrameSurfaceController } from "./browserFrameSurface";


interface BrowserPlotSaveRequest {
    url?: unknown;
    format?: unknown;
    index?: unknown;
}

interface BrowserWritableFile {
    write(data: Blob): Promise<void> | void;
    close(): Promise<void> | void;
}

interface BrowserSaveFileHandle {
    name?: string;
    createWritable(): Promise<BrowserWritableFile>;
}

interface BrowserPlotWindow extends Window {
    showSaveFilePicker?: (options: unknown) => Promise<BrowserSaveFileHandle>;
}

interface BrowserPlotImage {
    width?: unknown;
    height?: unknown;
}

interface BrowserPlotRenderWaiter {
    token: number;
    resolve(): void;
}

interface BrowserPlotViewerHostOptions {
    frameSurfaces: BrowserFrameSurfaceController;
    activateSurface(surfaceId: string): void;
    installSurfaceActivation(surfaceId: string, element?: HTMLElement | null): void;
    executeMutation(input?: Record<string, unknown>): Promise<unknown>;
    savePlot?(input?: Record<string, unknown>): Promise<unknown>;
    copyPlot?(url?: string): Promise<unknown>;
    closeCapturedImages?(images: unknown[]): void;
    getI18n?(): Record<string, string>;
    initialPayload?: Partial<PlotViewerPayload>;
    windowRef?: Window;
}

interface BrowserPlotViewerHostState {
    layer: HTMLElement | null;
    frame: HTMLIFrameElement | null;
    objectUrls: string[];
    frameReady: boolean;
    renderToken: number;
    renderWaiters: BrowserPlotRenderWaiter[];
    payload: PlotViewerPayload;
}

export interface BrowserPlotViewerHost {
    layer(): HTMLElement | null;
    isFrameReady(): boolean;
    open(payload?: PlotViewerPayload | null, options?: { hidden?: boolean }): void;
    prewarm(): void;
    waitForFrameReady(timeoutMs?: number): Promise<boolean>;
    waitForRender(renderToken: unknown, timeoutMs?: number): Promise<boolean>;
    updateFromCapturedImages(images: unknown): Promise<void>;
    handleMessage(event: MessageEvent): Promise<void>;
}

const downloadPlotAsFile = function(
    documentRef: Document,
    url: string,
    format: string,
    index: unknown
): void {
    const link = documentRef.createElement("a");

    link.href = url;
    link.download = createIndexedPlotSaveFileName(index, format);
    documentRef.body.appendChild(link);
    link.click();
    link.remove();
};


export const saveBrowserPlot = async function(
    input: BrowserPlotSaveRequest = {},
    windowRef: BrowserPlotWindow = window,
    documentRef: Document = document
): Promise<PlotSaveResult> {
    const rawRequest = input && typeof input === "object" ? input : {};
    const request = createPlotSaveRequest({
        url: String(rawRequest.url || ""),
        format: rawRequest.format
    });
    const url = request.url;
    const formatInfo = getPlotSaveFormatInfo(request.format);
    const format = formatInfo.format;

    if (!url) {
        return createInvalidPlotSaveResult();
    }

    if (windowRef.showSaveFilePicker) {
        try {
            const fileHandle = await windowRef.showSaveFilePicker({
                suggestedName: createPlotSaveFileName(format),
                types: [
                    {
                        description: formatInfo.label,
                        accept: {
                            [formatInfo.mimeType]: [formatInfo.extension]
                        }
                    }
                ]
            });
            const response = await fetch(url);
            const blob = await response.blob();
            const writable = await fileHandle.createWritable();

            try {
                await writable.write(blob);
            }
            finally {
                await writable.close();
            }

            return createSavedPlotSaveResult(fileHandle.name || "");
        }
        catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                return createCanceledPlotSaveResult();
            }

            return createFailedPlotSaveResult(error);
        }
    }

    downloadPlotAsFile(documentRef, url, format, rawRequest.index);

    return createSavedPlotSaveResult();
};


export const copyBrowserPlot = async function(
    value: unknown
): Promise<PlotCopyResult> {
    const url = String(value || "").trim();

    if (!url) {
        return createInvalidPlotCopyResult();
    }

    try {
        if (
            typeof ClipboardItem !== "undefined"
            && navigator.clipboard?.write
        ) {
            const response = await fetch(url);
            const blob = await response.blob();
            const type = blob.type || "image/png";

            await navigator.clipboard.write([
                new ClipboardItem({ [type]: blob })
            ]);

            return createCopiedPlotCopyResult();
        }

        throw new Error("Image clipboard access is unavailable.");
    }
    catch (error) {
        return createFailedPlotCopyResult(error);
    }
};


export const revokeBrowserPlotObjectUrls = function(
    urls: unknown,
    urlRef: typeof URL = URL
): void {
    const entries = Array.isArray(urls) ? urls : [];

    for (const url of entries) {
        try {
            urlRef.revokeObjectURL(String(url || ""));
        }
        catch {
            // Ignore stale object URLs; the browser may already have released them.
        }
    }
};


export const closeBrowserCapturedPlotImages = function(images: unknown): void {
    for (const image of Array.isArray(images) ? images : []) {
        try {
            (image as { close?: () => void })?.close?.();
        }
        catch {}
    }
};


export const createBrowserPlotObjectUrl = function(
    image: BrowserPlotImage,
    documentRef: Document = document,
    urlRef: typeof URL = URL
): Promise<string> {
    return new Promise((resolve, reject) => {
        const canvas = documentRef.createElement("canvas");
        const width = Math.max(1, Number(image?.width) || 1);
        const height = Math.max(1, Number(image?.height) || 1);

        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");

        if (!context) {
            reject(new Error("Could not create plot canvas context."));
            return;
        }

        context.drawImage(image as CanvasImageSource, 0, 0, width, height);
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error("Could not encode captured WebR plot."));
                return;
            }

            resolve(urlRef.createObjectURL(blob));
        }, "image/png");
    });
};


const defaultPlotViewerPayload = function(): PlotViewerPayload {
    return {
        status: "waiting",
        message: "Plots created by the runtime will appear here when graphics capture is active.",
        url: "",
        urls: [],
        count: 0,
        upid: "",
        updatedAt: new Date(0).toISOString()
    };
};


export const createBrowserPlotViewerHost = function(
    options: BrowserPlotViewerHostOptions
): BrowserPlotViewerHost {
    const windowRef = options.windowRef || window;
    const state: BrowserPlotViewerHostState = {
        layer: null,
        frame: null,
        objectUrls: [],
        frameReady: false,
        renderToken: 0,
        renderWaiters: [],
        payload: Object.assign(defaultPlotViewerPayload(), options.initialPayload || {})
    };

    const postUpdate = function(payload = state.payload): void {
        const frameWindow = state.frame?.contentWindow;

        if (!frameWindow) {
            return;
        }

        const i18n = options.getI18n ? options.getI18n() : {};

        frameWindow.postMessage({
            source: "dialogforge.browser-plot-host",
            type: "plotViewerUpdate",
            payload: Object.assign({}, payload || {}, {
                i18n
            })
        }, windowRef.location.origin);
    };

    const updatePayload = function(payload: Partial<PlotViewerPayload>): void {
        state.payload = Object.assign({}, state.payload, payload || {});
        postUpdate(state.payload);
    };

    const open = function(
        payload?: PlotViewerPayload | null,
        openOptions: { hidden?: boolean } = {}
    ): void {
        const hidden = openOptions.hidden === true;

        if (payload) {
            updatePayload(payload);
        }

        const surface = options.frameSurfaces.open({
            id: "plotViewer",
            title: options.getI18n?.()["Plot Viewer"] || "Plot Viewer",
            src: "/src/base-app/pages/plotViewer.html",
            width: 820,
            height: 620,
            hidden,
            role: "region",
            ariaModal: false,
            storageKey: "plotViewer",
            layerClass: "dialogforge-web-plot-layer",
            shellClass: "dialogforge-web-plot-window",
            titlebarClass: "dialogforge-web-plot-titlebar",
            titleClass: "dialogforge-web-plot-title",
            closeClass: "dialogforge-web-plot-close",
            frameClass: "dialogforge-web-plot-frame",
            onClose: function(): void {
                revokeBrowserPlotObjectUrls(state.objectUrls);
                state.objectUrls = [];
                state.layer = null;
                state.frame = null;
                state.frameReady = false;
                state.renderWaiters = [];
            },
            onFrameLoad: function(): void {
                postUpdate();
            },
            onActivate: function(): void {
                options.activateSurface("plotViewer");
            }
        });

        state.layer = surface.layer;
        state.frame = surface.frame;
        if (surface.created) {
            state.frameReady = false;
            options.installSurfaceActivation("plotViewer", surface.layer);
        }

        if (!hidden) {
            options.activateSurface("plotViewer");
        }

        postUpdate();
    };

    const prewarm = function(): void {
        if (state.layer?.isConnected) {
            return;
        }

        windowRef.setTimeout(() => {
            if (state.layer?.isConnected) {
                return;
            }

            open(null, { hidden: true });
        }, 0);
    };

    const waitForFrameReady = function(timeoutMs = 2500): Promise<boolean> {
        if (state.frameReady) {
            return Promise.resolve(true);
        }

        return new Promise((resolve) => {
            const startedAt = Date.now();
            const poll = function(): void {
                if (state.frameReady) {
                    resolve(true);
                    return;
                }

                if (Date.now() - startedAt >= timeoutMs) {
                    resolve(false);
                    return;
                }

                windowRef.setTimeout(poll, 50);
            };

            poll();
        });
    };

    const waitForRender = function(
        renderToken: unknown,
        timeoutMs = 1200
    ): Promise<boolean> {
        const token = Number(renderToken || 0);

        if (!token || !state.frame?.contentWindow) {
            return Promise.resolve(false);
        }

        return new Promise((resolve) => {
            const waiter: BrowserPlotRenderWaiter = {
                token,
                resolve: function(): void {
                    windowRef.clearTimeout(timer);
                    resolve(true);
                }
            };
            const timer = windowRef.setTimeout(() => {
                state.renderWaiters = state.renderWaiters.filter(function(entry): boolean {
                    return entry !== waiter;
                });
                resolve(false);
            }, timeoutMs);

            state.renderWaiters.push(waiter);
        });
    };

    const updateFromCapturedImages = async function(images: unknown): Promise<void> {
        const capturedImages = Array.isArray(images) ? images.filter(Boolean) : [];

        if (!capturedImages.length) {
            updatePayload(createEmptyPlotViewerPayload(state.payload.urls));
            return;
        }

        const urls = Array.isArray(state.objectUrls)
            ? state.objectUrls.slice()
            : [];

        for (const image of capturedImages) {
            urls.push(await createBrowserPlotObjectUrl(image as BrowserPlotImage));
        }
        options.closeCapturedImages?.(capturedImages);

        state.objectUrls = urls;

        const renderToken = state.renderToken + 1;
        const payload = createPlotViewerPayload(urls, renderToken);

        state.renderToken = renderToken;

        if (state.layer?.isConnected) {
            updatePayload(payload);
            open(null);
            return;
        }

        open(payload);
    };

    const handleMessage = async function(event: MessageEvent): Promise<void> {
        if (
            event.origin !== windowRef.location.origin
            || !event.data
            || event.data.source !== "dialogforge.browser-plot-viewer"
        ) {
            return;
        }

        const message = event.data;

        if (message.type === "ready") {
            state.frameReady = true;
            postUpdate();
            return;
        }

        if (message.type === "rendered") {
            const token = Number(message.renderToken || 0);
            const waiters = Array.isArray(state.renderWaiters)
                ? state.renderWaiters.slice()
                : [];

            if (state.layer?.isConnected) {
                options.activateSurface("plotViewer");
            }

            state.renderWaiters = waiters.filter(function(waiter): boolean {
                if (waiter.token !== token) {
                    return true;
                }

                waiter.resolve();
                return false;
            });
            return;
        }

        if (message.type === "executeInvisibleMutation") {
            await options.executeMutation(message.request || {});
            return;
        }

        if (message.type === "savePlot") {
            await (options.savePlot || saveBrowserPlot)(message.request || {});
            return;
        }

        if (message.type === "copyPlot") {
            await (options.copyPlot || copyBrowserPlot)(message.url || "");
        }
    };

    return {
        layer: function(): HTMLElement | null {
            return state.layer;
        },
        isFrameReady: function(): boolean {
            return state.frameReady;
        },
        open,
        prewarm,
        waitForFrameReady,
        waitForRender,
        updateFromCapturedImages,
        handleMessage
    };
};

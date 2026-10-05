import {
    createInvalidPlotCopyResult,
    createInvalidPlotSaveResult,
    createIndexedPlotSaveFileName,
    createPlotSaveRequest,
    createPlotSaveFileName,
    getPlotSaveFormatInfo,
    type PlotViewerPayload,
    type PlotCopyResult,
    type PlotSaveResult
} from "../base-app/features/plot-viewer/plotViewerState";
import {
    copyPlotThroughHost,
    readPlotExportResource,
    savePlotThroughHost
} from "../base-app/features/plot-viewer/plotExportOperations";
import {
    createPlotViewerPresentationState
} from "../base-app/features/plot-viewer/plotViewerPresentationState";
import type { BrowserFrameSurfaceController } from "./browserFrameSurface";
import { createBrowserResourceClient } from "../core/host/browserResourceClient";


const readBrowserPlotBlob = async function(url: string): Promise<Blob> {
    const response = await readPlotExportResource(createBrowserResourceClient(), url);

    return new Blob([new Uint8Array(response.body).buffer], {
        type: response.contentType || "image/png"
    });
};


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
    closeCapturedImages?(images: unknown[]): void;
    getI18n?(): Record<string, string>;
    initialPayload?: Partial<PlotViewerPayload>;
    windowRef?: Window;
}

interface BrowserPlotViewerHostState {
    layer: HTMLElement | null;
    frame: HTMLIFrameElement | null;
    frameReady: boolean;
    renderWaiters: BrowserPlotRenderWaiter[];
}

export interface BrowserPlotViewerHost {
    layer(): HTMLElement | null;
    isFrameReady(): boolean;
    open(payload?: PlotViewerPayload | null, options?: { hidden?: boolean }): void;
    refreshTitle(): void;
    notifyLanguageChanged(payload: unknown): void;
    prewarm(): void;
    waitForFrameReady(timeoutMs?: number): Promise<boolean>;
    waitForRender(renderToken: unknown, timeoutMs?: number): Promise<boolean>;
    updateFromCapturedImages(images: unknown, pageCount?: unknown): Promise<void>;
    retireResources(): void;
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

    return savePlotThroughHost(async () => {
        if (windowRef.showSaveFilePicker) {
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
            const blob = await readBrowserPlotBlob(url);
            const writable = await fileHandle.createWritable();

            try {
                await writable.write(blob);
            }
            finally {
                await writable.close();
            }

            return fileHandle.name || "";
        }

        downloadPlotAsFile(documentRef, url, format, rawRequest.index);

        return { status: "requested" };
    }, error => error instanceof DOMException && error.name === "AbortError");
};


export const copyBrowserPlot = async function(
    value: unknown
): Promise<PlotCopyResult> {
    const url = String(value || "").trim();

    if (!url) {
        return createInvalidPlotCopyResult();
    }

    return copyPlotThroughHost(async () => {
        if (
            typeof ClipboardItem !== "undefined"
            && navigator.clipboard?.write
        ) {
            const blob = await readBrowserPlotBlob(url);
            const type = blob.type || "image/png";

            await navigator.clipboard.write([
                new ClipboardItem({ [type]: blob })
            ]);

            return;
        }

        throw new Error("Image clipboard access is unavailable.");
    });
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


export const createBrowserPlotViewerHost = function(
    options: BrowserPlotViewerHostOptions
): BrowserPlotViewerHost {
    const windowRef = options.windowRef || window;
    const presentation = createPlotViewerPresentationState(options.initialPayload);
    const state: BrowserPlotViewerHostState = {
        layer: null,
        frame: null,
        frameReady: false,
        renderWaiters: []
    };
    let shiftPressed = false;

    const postModifierState = function(): void {
        state.frame?.contentWindow?.postMessage({
            source: "dialogforge.browser-plot-host",
            type: "plotViewportModifier",
            shiftPressed
        }, windowRef.location.origin);
    };

    windowRef.addEventListener("keydown", function(event): void {
        if (event.key !== "Shift") {
            return;
        }

        shiftPressed = true;
        postModifierState();
    });
    windowRef.addEventListener("keyup", function(event): void {
        if (event.key !== "Shift") {
            return;
        }

        shiftPressed = false;
        postModifierState();
    });
    windowRef.addEventListener("blur", function(): void {
        shiftPressed = false;
        postModifierState();
    });

    const postUpdate = function(payload = presentation.getPayload()): void {
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
        postUpdate(presentation.update(payload || {}));
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
                // Closing the surface does not close R's graphics history.
                // Keep the shared presentation until the runtime is retired.
                state.layer = null;
                state.frame = null;
                state.frameReady = false;
                state.renderWaiters = [];
            },
            onFrameLoad: function(): void {
                postUpdate();
                postModifierState();
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

    const updateFromCapturedImages = async function(
        images: unknown,
        pageCount?: unknown
    ): Promise<void> {
        const capturedImages = Array.isArray(images) ? images.filter(Boolean) : [];

        if (!capturedImages.length) {
            postUpdate(presentation.appendImages([]));
            return;
        }

        const payload = await presentation.receiveCapturedImages(
            capturedImages,
            pageCount,
            {
                createUrl: function(image): Promise<string> {
                    return createBrowserPlotObjectUrl(image as BrowserPlotImage);
                },
                closeImages: function(images): void {
                    options.closeCapturedImages?.(images);
                },
                releaseUrls: revokeBrowserPlotObjectUrls
            }
        );

        if (!payload || !presentation.isCurrentPayload(payload)) {
            return;
        }

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
            postModifierState();
            return;
        }

        if (message.type === "plotViewportModifierState") {
            if (event.source === state.frame?.contentWindow) {
                shiftPressed = message.shiftPressed === true;
            }
            return;
        }

        if (message.type === "rendered") {
            const token = Number(message.renderToken || 0);
            const waiters = Array.isArray(state.renderWaiters)
                ? state.renderWaiters.slice()
                : [];

            state.renderWaiters = waiters.filter(function(waiter): boolean {
                if (waiter.token !== token) {
                    return true;
                }

                waiter.resolve();
                return false;
            });
            return;
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
        refreshTitle: function(): void {
            options.frameSurfaces.updateTitle(
                "plotViewer",
                options.getI18n?.()["Plot Viewer"] || "Plot Viewer"
            );
        },
        notifyLanguageChanged: function(payload: unknown): void {
            state.frame?.contentWindow?.postMessage({
                source: "dialogforge.browser-plot-host",
                type: "languageChanged",
                payload
            }, windowRef.location.origin);
        },
        prewarm,
        waitForFrameReady,
        waitForRender,
        updateFromCapturedImages,
        retireResources: function(): void {
            revokeBrowserPlotObjectUrls(presentation.retireImages());
            postUpdate();
        },
        handleMessage
    };
};

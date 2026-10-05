import {
    createHelpViewerParameters,
    createHelpViewerOpenEntry
} from "../runtime/help/helpViewerDocument";
import {
    createRHelpTopicTitle
} from "../runtime/providers/r/help/rHelpPresentation";
import type {
    BrowserFrameSurfaceController
} from "./browserFrameSurface";


export interface BrowserHelpViewerDocument {
    topic?: string;
    html?: string;
    baseUrl?: string;
    packageName?: string;
    resourceBaseUrl?: string;
}


export interface BrowserHelpViewerSurface {
    open(document: BrowserHelpViewerDocument): void;
    handleMessage(event: MessageEvent): void;
}


export interface BrowserHelpViewerSurfaceOptions {
    frameSurfaces: BrowserFrameSurfaceController;
    onClose?(): void;
}


const setSurfaceTitle = function(
    layer: HTMLElement | null,
    frame: HTMLIFrameElement | null,
    title: string
): void {
    const titleNode = layer?.querySelector(".dialogforge-web-dialog__title");
    const shell = layer?.querySelector(".dialogforge-web-dialog");

    if (titleNode) {
        titleNode.textContent = title;
    }
    if (shell) {
        shell.setAttribute("aria-label", title);
    }
    if (frame) {
        frame.title = title;
    }
};


const buildHelpViewerSrc = function(
    title: string,
    document: BrowserHelpViewerDocument
): string {
    const params = createHelpViewerParameters({
        ...document,
        title,
        sourceUrl: document.baseUrl
    });

    return `/src/base-app/pages/help.html?${params.toString()}`;
};


export const createBrowserHelpViewerSurface = function(
    options: BrowserHelpViewerSurfaceOptions
): BrowserHelpViewerSurface {
    let layer: HTMLElement | null = null;
    let frame: HTMLIFrameElement | null = null;

    const open = function(document: BrowserHelpViewerDocument): void {
        const title = createRHelpTopicTitle(document.topic);

        if (frame?.contentWindow) {
            try {
                frame.contentWindow.postMessage(createHelpViewerOpenEntry({
                    ...document,
                    title,
                    sourceUrl: document.baseUrl
                }), "*");
            }
            catch {}

            setSurfaceTitle(layer, frame, title);
            return;
        }

        const surface = options.frameSurfaces.open({
            id: "helpViewer",
            title,
            src: buildHelpViewerSrc(title, document),
            width: 820,
            height: 620,
            storageKey: "helpViewer",
            layerClass: "dialogforge-web-help-layer",
            shellClass: "dialogforge-web-help-window",
            frameClass: "dialogforge-web-help-frame",
            onClose: function() {
                layer = null;
                frame = null;
                options.onClose?.();
            }
        });

        layer = surface.layer;
        frame = surface.frame;
    };

    const handleMessage = function(event: MessageEvent): void {
        const data = event?.data || {};

        if (String(data.id || "") !== "app-help-complete") {
            return;
        }

        const displayTitle = createRHelpTopicTitle(data.title, " - ");

        setSurfaceTitle(layer, frame, displayTitle);
    };

    return {
        open,
        handleMessage
    };
};

import {
    encodeHelpDocumentHtml
} from "../runtime/help/helpDocumentEncoding";
import type {
    BrowserFrameSurfaceController
} from "./browserFrameSurface";


export interface BrowserHelpViewerDocument {
    topic?: string;
    html?: string;
    baseUrl?: string;
    packageName?: string;
}


export interface BrowserHelpViewerSurface {
    open(document: BrowserHelpViewerDocument): void;
    handleMessage(event: MessageEvent): void;
}


export interface BrowserHelpViewerSurfaceOptions {
    frameSurfaces: BrowserFrameSurfaceController;
}


const helpTitle = function(topic?: string): string {
    const cleanTopic = String(topic || "").trim();

    return cleanTopic ? `R Help: ${cleanTopic}` : "R Help";
};


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
    const params = new URLSearchParams();

    params.set("title", title);
    if (document.topic) {
        params.set("topic", String(document.topic || ""));
    }
    if (document.packageName) {
        params.set("package", String(document.packageName || ""));
    }
    if (document.baseUrl) {
        params.set("src", String(document.baseUrl || ""));
        params.set("base", String(document.baseUrl || ""));
    }
    else {
        params.set("doc", encodeHelpDocumentHtml(document.html));
    }

    return `/src/base-app/pages/help.html?${params.toString()}`;
};


export const createBrowserHelpViewerSurface = function(
    options: BrowserHelpViewerSurfaceOptions
): BrowserHelpViewerSurface {
    let layer: HTMLElement | null = null;
    let frame: HTMLIFrameElement | null = null;

    const open = function(document: BrowserHelpViewerDocument): void {
        const title = helpTitle(document.topic);

        if (frame?.contentWindow) {
            try {
                frame.contentWindow.postMessage({
                    id: "app-help-open",
                    title,
                    html: String(document.html || ""),
                    baseUrl: String(document.baseUrl || ""),
                    base: String(document.baseUrl || ""),
                    topic: String(document.topic || ""),
                    packageName: String(document.packageName || "")
                }, "*");
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

        const title = String(data.title || "").trim();
        const displayTitle = title ? `R Help - ${title}` : "R Help";

        setSurfaceTitle(layer, frame, displayTitle);
    };

    return {
        open,
        handleMessage
    };
};

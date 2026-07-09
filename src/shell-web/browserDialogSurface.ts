import {
    createBrowserFrameSurfaceController,
    type BrowserFrameSurfaceController
} from "./browserFrameSurface";


export interface BrowserDialogSurfaceDefinition {
    dialogId: string;
    title: string;
    width?: number;
    height?: number;
    frameUrl?: string;
}


export interface BrowserDialogSurfaceController {
    open(definition: BrowserDialogSurfaceDefinition): HTMLIFrameElement;
    close(dialogId: string): void;
    focus(dialogId: string): void;
    has(dialogId: string): boolean;
}


export interface BrowserDialogSurfaceOptions {
    root?: HTMLElement;
    dialogFrameUrl?: string;
    frameSurfaceController?: BrowserFrameSurfaceController;
}


const defaultFrameUrl = "src/base-app/pages/dialogBuilder.html";


export const findBrowserDialogLayerForMessage = function(
    documentRef: Document,
    message: unknown,
    sourceWindow?: Window | null
): HTMLElement | null {
    const record = message && typeof message === "object"
        ? message as Record<string, unknown>
        : {};
    const dialogId = String(record.dialogId || record.dialogID || "").trim();

    if (dialogId) {
        const layer = documentRef.querySelector(
            `.dialogforge-web-dialog-layer[data-dialog-id="${CSS.escape(dialogId)}"]`
        );

        if (layer instanceof HTMLElement) {
            return layer;
        }
    }

    if (sourceWindow) {
        const frames = Array.from(
            documentRef.querySelectorAll(".dialogforge-web-dialog__frame")
        );
        const frame = frames.find((candidate) => {
            return candidate instanceof HTMLIFrameElement
                && candidate.contentWindow === sourceWindow;
        });
        const layer = frame?.closest(".dialogforge-web-dialog-layer");

        return layer instanceof HTMLElement ? layer : null;
    }

    return null;
};


export const createBrowserDialogSurfaceController = function(
    options: BrowserDialogSurfaceOptions = {}
): BrowserDialogSurfaceController {
    const frameSurfaces = options.frameSurfaceController ||
        createBrowserFrameSurfaceController({
            root: options.root
        });

    const surfaceId = function(dialogId: string): string {
        return String(dialogId || "").trim();
    };

    return {
        open: function(definition: BrowserDialogSurfaceDefinition): HTMLIFrameElement {
            const dialogId = surfaceId(definition.dialogId);
            const result = frameSurfaces.open({
                id: dialogId,
                title: definition.title || dialogId,
                src: definition.frameUrl || options.dialogFrameUrl || defaultFrameUrl,
                width: definition.width || 640,
                height: definition.height || 510,
                role: "dialog",
                ariaModal: true
            });

            result.frame.focus();

            return result.frame;
        },
        close: function(dialogId: string): void {
            frameSurfaces.close(surfaceId(dialogId));
        },
        focus: function(dialogId: string): void {
            frameSurfaces.get(surfaceId(dialogId))?.frame.focus();
        },
        has: function(dialogId: string): boolean {
            return frameSurfaces.get(surfaceId(dialogId)) !== null;
        }
    };
};

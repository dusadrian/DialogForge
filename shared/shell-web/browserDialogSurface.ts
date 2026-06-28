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
}


const styleId = "dialogforge-browser-dialog-surface-style";
const defaultFrameUrl = "shared/base-app/pages/dialogBuilder.html";


const ensureStyles = function(documentRef: Document): void {
    if (documentRef.getElementById(styleId)) {
        return;
    }

    const style = documentRef.createElement("style");

    style.id = styleId;
    style.textContent = [
        ".dialogforge-web-dialog-layer{position:fixed;inset:0;z-index:10000;",
        "display:flex;align-items:center;justify-content:center;",
        "background:rgba(0,0,0,.22);}",
        ".dialogforge-web-dialog{box-sizing:border-box;background:#fff;",
        "border:1px solid #bdbdbd;box-shadow:0 10px 28px rgba(0,0,0,.24);",
        "display:flex;flex-direction:column;max-width:calc(100vw - 32px);",
        "max-height:calc(100vh - 32px);}",
        ".dialogforge-web-dialog__titlebar{height:30px;display:flex;",
        "align-items:center;justify-content:space-between;padding:0 8px 0 10px;",
        "border-bottom:1px solid #dedede;background:#f5f5f5;color:#222;",
        "font:12px system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;}",
        ".dialogforge-web-dialog__title{overflow:hidden;text-overflow:ellipsis;",
        "white-space:nowrap;font-weight:600;}",
        ".dialogforge-web-dialog__close{width:24px;height:24px;border:0;",
        "background:transparent;color:#333;font:18px/20px system-ui,sans-serif;",
        "cursor:pointer;}",
        ".dialogforge-web-dialog__close:hover{background:#e6e6e6;}",
        ".dialogforge-web-dialog__frame{border:0;display:block;flex:1 1 auto;",
        "width:100%;min-height:120px;background:#fff;}"
    ].join("");
    documentRef.head.appendChild(style);
};


const normalizeSize = function(value: number | undefined, fallback: number): number {
    const numeric = Math.round(Number(value) || fallback);

    return Math.max(160, numeric);
};


export const createBrowserDialogSurfaceController = function(
    options: BrowserDialogSurfaceOptions = {}
): BrowserDialogSurfaceController {
    const root = options.root || document.body;
    const documentRef = root.ownerDocument || document;
    const surfaces = new Map<string, HTMLElement>();

    const open = function(definition: BrowserDialogSurfaceDefinition): HTMLIFrameElement {
        const dialogId = String(definition.dialogId || "").trim();

        if (!dialogId) {
            throw new Error("Dialog id is required.");
        }

        const existing = surfaces.get(dialogId);

        if (existing) {
            const frame = existing.querySelector("iframe");

            existing.focus();
            return frame as HTMLIFrameElement;
        }

        ensureStyles(documentRef);

        const layer = documentRef.createElement("div");
        const dialog = documentRef.createElement("section");
        const titlebar = documentRef.createElement("div");
        const title = documentRef.createElement("div");
        const close = documentRef.createElement("button");
        const frame = documentRef.createElement("iframe");
        const width = normalizeSize(definition.width, 640);
        const height = normalizeSize(definition.height, 480);

        layer.className = "dialogforge-web-dialog-layer";
        layer.dataset.dialogId = dialogId;
        dialog.className = "dialogforge-web-dialog";
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
        dialog.style.width = `${width}px`;
        dialog.style.height = `${height + 30}px`;
        titlebar.className = "dialogforge-web-dialog__titlebar";
        title.className = "dialogforge-web-dialog__title";
        title.textContent = definition.title || dialogId;
        close.className = "dialogforge-web-dialog__close";
        close.type = "button";
        close.setAttribute("aria-label", "Close");
        close.textContent = "x";
        frame.className = "dialogforge-web-dialog__frame";
        frame.src = definition.frameUrl || options.dialogFrameUrl || defaultFrameUrl;
        frame.title = definition.title || dialogId;

        close.addEventListener("click", () => {
            surfaces.delete(dialogId);
            layer.remove();
        });

        titlebar.append(title, close);
        dialog.append(titlebar, frame);
        layer.append(dialog);
        root.appendChild(layer);
        surfaces.set(dialogId, layer);
        frame.focus();

        return frame;
    };

    return {
        open,
        close: function(dialogId: string): void {
            const layer = surfaces.get(dialogId);

            if (!layer) {
                return;
            }

            surfaces.delete(dialogId);
            layer.remove();
        },
        focus: function(dialogId: string): void {
            surfaces.get(dialogId)?.focus();
        },
        has: function(dialogId: string): boolean {
            return surfaces.has(dialogId);
        }
    };
};

import {
    createAuxiliarySurfaceRegistry,
    normalizeAuxiliarySurfaceId,
    normalizeAuxiliarySurfaceSize,
    shouldActivateAuxiliarySurface
} from "../base-app/features/auxiliary-surfaces/auxiliarySurfaceLifecycle";


export interface BrowserFrameSurfaceInstallDraggableOptions {
    mode?: "fixed" | "absolute";
    storageKey?: string;
}


export interface BrowserFrameSurfaceDefinition {
    id: string;
    title: string;
    src: string;
    srcdoc?: string;
    width: number;
    height: number;
    hidden?: boolean;
    role?: string;
    ariaModal?: boolean;
    frameTitle?: string;
    storageKey?: string;
    layerClass?: string;
    shellClass?: string;
    titlebarClass?: string;
    titleClass?: string;
    closeClass?: string;
    frameClass?: string;
    onClose?(): void;
    onFrameLoad?(): void;
    onActivate?(layer: HTMLElement): void;
}


export interface BrowserFrameSurfaceResult {
    layer: HTMLElement;
    shell: HTMLElement;
    titlebar: HTMLElement;
    title: HTMLElement;
    close: HTMLButtonElement;
    frame: HTMLIFrameElement;
    created: boolean;
}


export interface BrowserFrameSurfaceControllerOptions {
    root?: HTMLElement;
    installDraggable?(
        surface: HTMLElement,
        handle: HTMLElement,
        options?: BrowserFrameSurfaceInstallDraggableOptions
    ): void;
    installResizable?(surface: HTMLElement, handles: HTMLElement[]): void;
}


export interface BrowserFrameSurfaceController {
    open(definition: BrowserFrameSurfaceDefinition): BrowserFrameSurfaceResult;
    close(id: string): void;
    get(id: string): BrowserFrameSurfaceResult | null;
}


export interface BrowserModelessSurfaceEntry {
    id: string;
    element?: HTMLElement | null;
}


export interface BrowserModelessSurfaceController {
    activate(surfaceId: string): void;
    installActivation(surfaceId: string, element?: HTMLElement | null): void;
    activeSurfaceId(): string;
}


interface StoredSurface extends BrowserFrameSurfaceResult {
    onClose?: () => void;
    activateFromFrame?: () => void;
    installFrameActivation?: () => void;
    frameActivationCleanup?: () => void;
}


const dialogLayerClass = "dialogforge-web-dialog-layer";
const dialogShellClass = "dialogforge-web-dialog";
const dialogTitlebarClass = "dialogforge-web-dialog__titlebar";
const dialogTitleClass = "dialogforge-web-dialog__title";
const dialogCloseClass = "dialogforge-web-dialog__close";
const dialogFrameClass = "dialogforge-web-dialog__frame";


const joinClasses = function(...classes: Array<string | undefined | false>): string {
    return classes
        .flatMap((value) => String(value || "").split(/\s+/))
        .map((value) => value.trim())
        .filter(Boolean)
        .join(" ");
};


const applySurfaceDefinition = function(
    stored: StoredSurface,
    definition: BrowserFrameSurfaceDefinition
): void {
    const hidden = definition.hidden === true;
    const useDialogChrome = !hidden;

    stored.layer.className = joinClasses(
        useDialogChrome && dialogLayerClass,
        definition.layerClass
    );
    stored.layer.dataset.surfaceId = definition.id;
    stored.layer.style.display = hidden ? "none" : "";

    stored.shell.className = joinClasses(
        definition.shellClass,
        useDialogChrome && dialogShellClass
    );
    stored.shell.setAttribute("role", definition.role || "dialog");
    if (definition.ariaModal === false) {
        stored.shell.removeAttribute("aria-modal");
    }
    else {
        stored.shell.setAttribute("aria-modal", "true");
    }
    stored.shell.setAttribute("aria-label", definition.title);
    stored.shell.style.width = `${normalizeAuxiliarySurfaceSize(definition.width, 160, 160)}px`;
    stored.shell.style.height = `${normalizeAuxiliarySurfaceSize(definition.height, 120, 120)}px`;

    stored.titlebar.className = joinClasses(
        definition.titlebarClass,
        useDialogChrome && dialogTitlebarClass
    );
    stored.title.className = joinClasses(
        definition.titleClass,
        useDialogChrome && dialogTitleClass
    );
    stored.title.textContent = definition.title;
    stored.close.className = joinClasses(
        definition.closeClass,
        useDialogChrome && dialogCloseClass
    );
    stored.close.setAttribute("aria-label", "Close");
    stored.frame.className = joinClasses(
        useDialogChrome && dialogFrameClass,
        definition.frameClass
    );
    stored.frame.title = definition.frameTitle || definition.title;
    stored.onClose = definition.onClose;
    stored.activateFromFrame = function(): void {
        definition.onActivate?.(stored.layer);
    };

    if (typeof definition.srcdoc === "string") {
        if (stored.frame.srcdoc !== definition.srcdoc) {
            stored.frame.removeAttribute("src");
            stored.frame.srcdoc = definition.srcdoc;
        }
    }
    else if (stored.frame.getAttribute("src") !== definition.src) {
        stored.frame.removeAttribute("srcdoc");
        stored.frame.src = definition.src;
    }

    stored.installFrameActivation?.();
};


const installFrameActivation = function(stored: StoredSurface): void {
    stored.frameActivationCleanup?.();
    stored.frameActivationCleanup = undefined;

    const run = function(): void {
        stored.activateFromFrame?.();
    };

    try {
        const frameWindow = stored.frame.contentWindow;
        const frameDocument = stored.frame.contentDocument;

        if (!frameWindow || !frameDocument) {
            return;
        }

        frameWindow.addEventListener("pointerdown", run, true);
        frameWindow.addEventListener("focusin", run, true);
        frameDocument.addEventListener("pointerdown", run, true);
        frameDocument.addEventListener("focusin", run, true);

        stored.frameActivationCleanup = function(): void {
            frameWindow.removeEventListener("pointerdown", run, true);
            frameWindow.removeEventListener("focusin", run, true);
            frameDocument.removeEventListener("pointerdown", run, true);
            frameDocument.removeEventListener("focusin", run, true);
        };
    }
    catch {
        // Cross-origin frames cannot be inspected; same-origin app frames still activate.
    }
};


export const createBrowserModelessSurfaceController = function(
    readEntries: () => BrowserModelessSurfaceEntry[]
): BrowserModelessSurfaceController {
    let activeModelessSurface = "";

    const entries = function(): BrowserModelessSurfaceEntry[] {
        return (readEntries() || []).filter(function(entry): boolean {
            return Boolean(entry.element?.isConnected);
        });
    };

    const activate = function(surfaceId: string): void {
        const id = String(surfaceId || "");

        activeModelessSurface = id;
        entries().forEach(function(entry): void {
            if (entry.element) {
                entry.element.style.zIndex = entry.id === id ? "1010" : "1000";
            }
        });
    };

    const installActivation = function(
        surfaceId: string,
        element?: HTMLElement | null
    ): void {
        if (!element) {
            return;
        }

        const run = function(): void {
            activate(surfaceId);
        };

        element.addEventListener("pointerdown", run, true);
        element.addEventListener("focusin", run, true);
    };

    return {
        activate,
        installActivation,
        activeSurfaceId: function(): string {
            return activeModelessSurface;
        }
    };
};


export const createBrowserFrameSurfaceController = function(
    options: BrowserFrameSurfaceControllerOptions = {}
): BrowserFrameSurfaceController {
    const root = options.root || document.body;
    const documentRef = root.ownerDocument || document;
    const surfaces = createAuxiliarySurfaceRegistry<StoredSurface>();

    const close = function(id: string): void {
        const stored = surfaces.delete(id);

        if (!stored) {
            return;
        }

        stored.frameActivationCleanup?.();
        stored.layer.remove();
        stored.onClose?.();
    };

    const open = function(
        definition: BrowserFrameSurfaceDefinition
    ): BrowserFrameSurfaceResult {
        const id = normalizeAuxiliarySurfaceId(
            definition.id,
            "Browser frame surface id is required."
        );

        const existing = surfaces.get(id);

        if (existing) {
            applySurfaceDefinition(existing, definition);
            if (shouldActivateAuxiliarySurface(definition)) {
                definition.onActivate?.(existing.layer);
                existing.frame.focus();
            }

            return Object.assign({}, existing, { created: false });
        }

        const layer = documentRef.createElement("div");
        const shell = documentRef.createElement("section");
        const titlebar = documentRef.createElement("div");
        const title = documentRef.createElement("div");
        const closeButton = documentRef.createElement("button");
        const frame = documentRef.createElement("iframe");
        const rightHandle = documentRef.createElement("span");
        const bottomHandle = documentRef.createElement("span");
        const cornerHandle = documentRef.createElement("span");
        const stored: StoredSurface = {
            layer,
            shell,
            titlebar,
            title,
            close: closeButton,
            frame,
            created: true,
            onClose: definition.onClose
        };
        stored.installFrameActivation = function(): void {
            installFrameActivation(stored);
        };

        closeButton.type = "button";
        closeButton.textContent = "x";
        closeButton.addEventListener("click", () => {
            close(id);
        });
        frame.addEventListener("load", () => {
            stored.installFrameActivation?.();
            definition.onFrameLoad?.();
        });

        rightHandle.className = "web-workbench-resize-handle";
        rightHandle.dataset.resizeDirection = "right";
        bottomHandle.className = "web-workbench-resize-handle";
        bottomHandle.dataset.resizeDirection = "bottom";
        cornerHandle.className = "web-workbench-resize-handle";
        cornerHandle.dataset.resizeDirection = "corner";

        applySurfaceDefinition(stored, definition);

        titlebar.append(title, closeButton);
        shell.append(titlebar, frame, rightHandle, bottomHandle, cornerHandle);
        layer.append(shell);
        root.appendChild(layer);
        surfaces.set(id, stored);

        options.installDraggable?.(shell, titlebar, {
            mode: "fixed",
            storageKey: definition.storageKey || id
        });
        options.installResizable?.(shell, [rightHandle, bottomHandle, cornerHandle]);

        if (shouldActivateAuxiliarySurface(definition)) {
            definition.onActivate?.(layer);
            frame.focus();
        }

        return Object.assign({}, stored);
    };

    return {
        open,
        close,
        get: function(id: string): BrowserFrameSurfaceResult | null {
            const stored = surfaces.get(id);

            return stored ? Object.assign({}, stored, { created: false }) : null;
        }
    };
};

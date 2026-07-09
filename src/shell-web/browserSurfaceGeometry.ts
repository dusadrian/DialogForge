import {
    clampSurfaceNumber,
    clampSurfacePosition,
    clampSurfaceSize,
    createPersistedSurfacePositionKey,
    parsePersistedSurfacePosition,
    stringifyPersistedSurfacePosition,
    type SurfaceBounds
} from "../base-app/features/auxiliary-surfaces/surfaceGeometryPolicy";

export interface BrowserSurfaceBounds {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface BrowserSurfaceDragOptions {
    boundsElement?: HTMLElement | null;
    mode?: "fixed" | "absolute";
    storageKey?: string;
}

export interface BrowserSurfaceResizeOptions {
    boundsElement?: HTMLElement | null;
}

interface BrowserSurfaceDragState {
    pointerId: number;
    mode: "fixed" | "absolute";
    startX: number;
    startY: number;
    left: number;
    top: number;
    width: number;
    height: number;
}

interface BrowserSurfaceResizeState {
    pointerId: number;
    direction: string;
    startX: number;
    startY: number;
    width: number;
    height: number;
    left: number;
    top: number;
    minWidth: number;
    minHeight: number;
    maxWidth: number;
    maxHeight: number;
}

export const clampBrowserNumber = function(
    value: number,
    minimum: number,
    maximum: number
): number {
    return clampSurfaceNumber(value, minimum, maximum);
};

const isInteractiveDragTarget = function(target: EventTarget | null): boolean {
    return target instanceof Element
        && Boolean(target.closest("button, input, textarea, select, a, iframe, [contenteditable='true']"));
};

const readBrowserSurfaceBounds = function(
    boundsElement?: HTMLElement | null
): SurfaceBounds {
    if (boundsElement) {
        const rect = boundsElement.getBoundingClientRect();

        return {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height
        };
    }

    return {
        left: 0,
        top: 0,
        width: window.innerWidth,
        height: window.innerHeight
    };
};

const cssPixelValue = function(value: unknown, fallback: number): number {
    const numeric = Number.parseFloat(String(value || ""));

    return Number.isFinite(numeric) && numeric > 0
        ? numeric
        : fallback;
};

export const installBrowserDraggableSurface = function(
    surface: HTMLElement | null,
    handle: HTMLElement | null,
    options: BrowserSurfaceDragOptions = {}
): void {
    if (!surface || !handle) {
        return;
    }

    let drag: BrowserSurfaceDragState | null = null;
    const storageKey = createPersistedSurfacePositionKey(options.storageKey);

    const readBounds = function(): SurfaceBounds {
        return readBrowserSurfaceBounds(options.boundsElement);
    };

    const readMode = function(): "fixed" | "absolute" {
        return options.mode || (
            window.getComputedStyle(surface).position === "fixed"
                ? "fixed"
                : "absolute"
        );
    };

    const applyPosition = function(
        left: number,
        top: number,
        width: number,
        height: number,
        mode = readMode()
    ): { left: number; top: number } {
        const bounds = readBounds();
        const next = clampSurfacePosition(left, top, width, height, bounds);

        surface.style.position = mode;
        surface.style.left = `${Math.round(next.left)}px`;
        surface.style.top = `${Math.round(next.top)}px`;
        surface.style.transform = "none";

        return next;
    };

    const restorePosition = function(): void {
        if (!storageKey) {
            return;
        }

        try {
            const rect = surface.getBoundingClientRect();
            const saved = parsePersistedSurfacePosition(
                JSON.parse(window.localStorage.getItem(storageKey) || "null"),
                readMode()
            );

            if (!saved) {
                return;
            }

            applyPosition(saved.left, saved.top, rect.width, rect.height, saved.mode);
        }
        catch {}
    };

    const savePosition = function(mode: "fixed" | "absolute"): void {
        if (!storageKey) {
            return;
        }

        try {
            const bounds = readBounds();
            const rect = surface.getBoundingClientRect();
            const left = mode === "fixed"
                ? rect.left
                : rect.left - bounds.left;
            const top = mode === "fixed"
                ? rect.top
                : rect.top - bounds.top;

            window.localStorage.setItem(
                storageKey,
                stringifyPersistedSurfacePosition({
                    mode,
                    left,
                    top
                })
            );
        }
        catch {}
    };

    restorePosition();

    const beginDrag = function(event: PointerEvent): void {
        if (event.button !== 0 || isInteractiveDragTarget(event.target)) {
            return;
        }

        const bounds = readBounds();
        const rect = surface.getBoundingClientRect();
        const mode = readMode();
        const left = mode === "fixed"
            ? rect.left
            : rect.left - bounds.left;
        const top = mode === "fixed"
            ? rect.top
            : rect.top - bounds.top;

        surface.style.position = mode;
        surface.style.left = `${left}px`;
        surface.style.top = `${top}px`;
        surface.style.transform = "none";

        drag = {
            pointerId: event.pointerId,
            mode,
            startX: event.clientX,
            startY: event.clientY,
            left,
            top,
            width: rect.width,
            height: rect.height
        };

        handle.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    };

    const moveDrag = function(event: PointerEvent): void {
        if (!drag || event.pointerId !== drag.pointerId) {
            return;
        }

        const bounds = readBounds();
        const nextLeft = drag.left + event.clientX - drag.startX;
        const nextTop = drag.top + event.clientY - drag.startY;
        const next = clampSurfacePosition(
            nextLeft,
            nextTop,
            drag.width,
            drag.height,
            bounds
        );

        surface.style.left = `${next.left}px`;
        surface.style.top = `${next.top}px`;
    };

    const endDrag = function(event: PointerEvent): void {
        if (!drag || event.pointerId !== drag.pointerId) {
            return;
        }

        handle.releasePointerCapture?.(event.pointerId);
        savePosition(drag.mode);
        drag = null;
    };

    handle.addEventListener("pointerdown", beginDrag);
    handle.addEventListener("pointermove", moveDrag);
    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);
};

export const installBrowserResizableSurface = function(
    surface: HTMLElement | null,
    handles: HTMLElement[],
    options: BrowserSurfaceResizeOptions = {}
): void {
    if (!surface || !handles?.length) {
        return;
    }

    let resize: BrowserSurfaceResizeState | null = null;

    const readBounds = function(): SurfaceBounds {
        return readBrowserSurfaceBounds(options.boundsElement);
    };

    const beginResize = function(event: PointerEvent): void {
        if (event.button !== 0) {
            return;
        }

        const handle = event.currentTarget as HTMLElement;
        const bounds = readBounds();
        const rect = surface.getBoundingClientRect();
        const styles = window.getComputedStyle(surface);

        resize = {
            pointerId: event.pointerId,
            direction: String(handle.dataset.resizeDirection || "corner"),
            startX: event.clientX,
            startY: event.clientY,
            width: rect.width,
            height: rect.height,
            left: rect.left - bounds.left,
            top: rect.top - bounds.top,
            minWidth: cssPixelValue(styles.minWidth, 480),
            minHeight: cssPixelValue(styles.minHeight, 320),
            maxWidth: Math.max(1, bounds.width - Math.max(0, rect.left - bounds.left)),
            maxHeight: Math.max(1, bounds.height - Math.max(0, rect.top - bounds.top))
        };

        surface.style.width = `${Math.round(rect.width)}px`;
        surface.style.height = `${Math.round(rect.height)}px`;
        handle.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    };

    const moveResize = function(event: PointerEvent): void {
        if (!resize || event.pointerId !== resize.pointerId) {
            return;
        }

        const direction = resize.direction;
        const deltaX = event.clientX - resize.startX;
        const deltaY = event.clientY - resize.startY;
        const next = clampSurfaceSize(
            direction === "right" || direction === "corner"
                ? resize.width + deltaX
                : resize.width,
            direction === "bottom" || direction === "corner"
                ? resize.height + deltaY
                : resize.height,
            resize.minWidth,
            resize.minHeight,
            direction === "right" || direction === "corner"
                ? resize.maxWidth
                : resize.width,
            direction === "bottom" || direction === "corner"
                ? resize.maxHeight
                : resize.height
        );

        surface.style.width = `${Math.round(next.width)}px`;
        surface.style.height = `${Math.round(next.height)}px`;
    };

    const endResize = function(event: PointerEvent): void {
        if (!resize || event.pointerId !== resize.pointerId) {
            return;
        }

        (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
        resize = null;
    };

    handles.forEach((handle) => {
        handle.addEventListener("pointerdown", beginResize);
        handle.addEventListener("pointermove", moveResize);
        handle.addEventListener("pointerup", endResize);
        handle.addEventListener("pointercancel", endResize);
    });
};

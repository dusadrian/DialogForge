export type MainZoomShortcutAction = "in" | "out" | "reset";


export const readMainZoomMenuAction = function(role: unknown): MainZoomShortcutAction | null {
    const value = String(role || "").trim();

    if (value === "zoomIn") {
        return "in";
    }
    if (value === "zoomOut") {
        return "out";
    }
    if (value === "resetZoom") {
        return "reset";
    }

    return null;
};


export const clampMainZoomFactor = function(value: unknown, fallback = 1): number {
    const next = Number(value);
    return Number.isFinite(next) ? Math.max(0.5, Math.min(3, next)) : fallback;
};


export const readMainZoomShortcut = function(input: {
    key?: string;
    code?: string;
    ctrlCmd: boolean;
    alt?: boolean;
}): MainZoomShortcutAction | null {
    if (!input.ctrlCmd || input.alt) {
        return null;
    }

    if (
        input.key === "+"
        || input.key === "="
        || input.key === "Add"
        || input.code === "NumpadAdd"
    ) {
        return "in";
    }

    if (
        input.key === "-"
        || input.key === "_"
        || input.key === "Subtract"
        || input.code === "NumpadSubtract"
    ) {
        return "out";
    }

    if (
        input.key === "0"
        || input.code === "Digit0"
        || input.code === "Numpad0"
    ) {
        return "reset";
    }

    return null;
};


export const nextMainZoomFactor = function(
    action: MainZoomShortcutAction,
    current: number,
    defaultFactor = 1
): number {
    return action === "reset"
        ? defaultFactor
        : clampMainZoomFactor(current + (action === "in" ? 0.1 : -0.1), defaultFactor);
};

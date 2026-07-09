export interface SurfaceBounds {
    left: number;
    top: number;
    width: number;
    height: number;
}


export interface SurfacePosition {
    left: number;
    top: number;
}


export interface SurfaceSize {
    width: number;
    height: number;
}


export type SurfacePositionMode = "fixed" | "absolute";


export interface PersistedSurfacePosition {
    mode: SurfacePositionMode;
    left: number;
    top: number;
}


export const clampSurfaceNumber = function(
    value: number,
    minimum: number,
    maximum: number
): number {
    return Math.max(minimum, Math.min(maximum, value));
};


export const createPersistedSurfacePositionKey = function(
    storageKey: unknown
): string {
    const value = String(storageKey || "").trim();

    return value ? `dialogforge.web.modal.position.${value}` : "";
};


export const parsePersistedSurfacePosition = function(
    value: unknown,
    fallbackMode: SurfacePositionMode
): PersistedSurfacePosition | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }

    const record = value as Record<string, unknown>;
    const left = Number(record.left);
    const top = Number(record.top);

    if (!Number.isFinite(left) || !Number.isFinite(top)) {
        return null;
    }

    return {
        mode: record.mode === "absolute" || record.mode === "fixed"
            ? record.mode
            : fallbackMode,
        left,
        top
    };
};


export const stringifyPersistedSurfacePosition = function(
    position: PersistedSurfacePosition
): string {
    return JSON.stringify({
        mode: position.mode,
        left: Math.round(position.left),
        top: Math.round(position.top)
    });
};


export const clampSurfacePosition = function(
    left: number,
    top: number,
    width: number,
    height: number,
    bounds: SurfaceBounds
): SurfacePosition {
    return {
        left: clampSurfaceNumber(left, 0, Math.max(0, bounds.width - width)),
        top: clampSurfaceNumber(top, 0, Math.max(0, bounds.height - height))
    };
};


export const clampSurfaceSize = function(
    width: number,
    height: number,
    minimumWidth: number,
    minimumHeight: number,
    maximumWidth: number,
    maximumHeight: number
): SurfaceSize {
    return {
        width: clampSurfaceNumber(width, minimumWidth, maximumWidth),
        height: clampSurfaceNumber(height, minimumHeight, maximumHeight)
    };
};

export interface PlotViewport {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
}


export interface PlotViewportBounds {
    left: number;
    top: number;
    right: number;
    bottom: number;
}


export interface PlotViewportPoint {
    x: number;
    y: number;
}


export interface PlotViewportSelectionRange {
    left: number;
    right: number;
    top: number;
    bottom: number;
}


export interface PlotViewportSelection extends PlotViewportSelectionRange {
    width: number;
    height: number;
    normalized: PlotViewportSelectionRange;
}


export type PlotViewportGestureMode = "rectangle" | "pan";
export type PlotViewportSelectionPhase = "start" | "move" | "end" | "cancel";


export interface PlotViewportGestureStart {
    mode: PlotViewportGestureMode;
    point: PlotViewportPoint;
}


export interface PlotViewportPanStart {
    point: PlotViewportPoint;
}


export interface PlotViewportPanMovement {
    point: PlotViewportPoint;
    totalX: number;
    totalY: number;
    normalizedX: number;
    normalizedY: number;
}


export interface PlotViewportHover {
    event: PointerEvent;
    point: PlotViewportPoint;
    shiftPressed: boolean;
}


export interface PlotViewportGestureState {
    selecting: boolean;
    panning: boolean;
    shiftPressed: boolean;
}


export interface PlotViewportInteractionOptions {
    element: HTMLElement;
    getBounds?(): PlotViewportBounds;
    minimumRectangleSize?: number;
    rectangle?: boolean;
    rectangleCursor?: string;
    onGestureStart?(gesture: PlotViewportGestureStart): void;
    onSelectionChange?(
        selection: PlotViewportSelection | null,
        phase: PlotViewportSelectionPhase
    ): void;
    onRectangleComplete?(selection: PlotViewportSelection | null): void;
    onPanStart?(gesture: PlotViewportPanStart): void;
    onPan?(movement: PlotViewportPanMovement): void;
    onPanEnd?(): void;
    onHover?(hover: PlotViewportHover): void;
    onLeave?(): void;
    onGestureStateChange?(state: PlotViewportGestureState): void;
}


export interface PlotViewportInteraction {
    cancel(): void;
    dispose(): void;
    getSelection(): PlotViewportSelection | null;
    isPanning(): boolean;
    isSelecting(): boolean;
    isShiftPressed(): boolean;
    setShiftPressed(value: boolean): void;
    refreshCursor(): void;
}


export interface PlotViewportApi {
    centeredViewport(zoom: number, bounds?: PlotViewport): PlotViewport;
    createInteraction(
        options: PlotViewportInteractionOptions
    ): PlotViewportInteraction;
    pannedViewport(
        viewport: PlotViewport,
        deltaX: number,
        deltaY: number,
        bounds?: PlotViewport
    ): PlotViewport;
    viewportFromSelection(
        viewport: PlotViewport,
        selection: PlotViewportSelectionRange
    ): PlotViewport;
}


declare global {
    interface Window {
        DialogForgePlotViewport?: PlotViewportApi;
    }
}

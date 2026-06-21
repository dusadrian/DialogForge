export interface MainZoomScaling {
    readZoomFactor(): number;
    scaleLayoutSize(value: number): number;
    setZoomFactor(zoomFactor: number): void;
}


export const createMainZoomScaling = function(): MainZoomScaling {
    let mainZoomFactor = 1;

    const readZoomFactor = function(): number {
        return Math.max(0.5, Math.min(3, mainZoomFactor || 1));
    };

    const scaleLayoutSize = function(value: number): number {
        return Math.ceil(Math.max(0, Number(value) || 0) * readZoomFactor());
    };

    return {
        readZoomFactor,
        scaleLayoutSize,
        setZoomFactor: function(zoomFactor): void {
            mainZoomFactor = zoomFactor;
        }
    };
};

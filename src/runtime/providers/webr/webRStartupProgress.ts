export interface WebRStartupProgressStage {
    start: number;
    end: number;
}


export interface WebRStartupProgressStatusUpdate {
    message: string;
    visible: boolean;
    progressValue: number;
    resetProgress: boolean;
    trickleLimit: number;
}


export const defaultWebRStartupProgressMessage = "Loading web runtime...";


const webRStartupProgressStages: Record<string, WebRStartupProgressStage> = {
    [defaultWebRStartupProgressMessage]: { start: 2, end: 6 },
    "Starting WebR...": { start: 6, end: 10 },
    "Loading WebR runtime...": { start: 10, end: 18 },
    "Initializing WebR...": { start: 18, end: 38 },
    "Checking WebR package library cache...": { start: 38, end: 42 },
    "Loading cached WebR package library...": { start: 42, end: 56 },
    "Downloading WebR package library...": { start: 42, end: 58 },
    "Decompressing WebR package library...": { start: 58, end: 66 },
    "Caching WebR package library...": { start: 66, end: 70 },
    "Mounting WebR package library...": { start: 70, end: 78 },
    "Preparing WebR workspace...": { start: 78, end: 86 },
    "Loading shared R runtime services...": { start: 86, end: 94 },
    "Running application startup tasks...": { start: 94, end: 96 },
    "Reading WebR workspace...": { start: 96, end: 98 },
    "Loading launch dataset...": { start: 98, end: 99 },
    "WebR ready": { start: 100, end: 100 }
};


export const clampWebRStartupProgress = function(value: unknown): number {
    return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
};


export const readWebRStartupProgressStage = function(
    message: unknown
): WebRStartupProgressStage | null {
    return webRStartupProgressStages[String(message || "").trim()] || null;
};


export const readWebRStartupProgressFromStage = function(
    message: unknown,
    fraction = 0
): number | null {
    const stage = readWebRStartupProgressStage(message);

    if (!stage) {
        return null;
    }

    const amount = Math.max(0, Math.min(1, Number(fraction) || 0));

    return stage.start + ((stage.end - stage.start) * amount);
};


export const createWebRStartupProgressStatusUpdate = function(
    text: unknown,
    progress: number | undefined,
    currentProgress: number
): WebRStartupProgressStatusUpdate {
    const message = String(text || "").trim();
    const stage = readWebRStartupProgressStage(message);
    const visible = Boolean(stage) && message !== "WebR ready";
    const progressValue = clampWebRStartupProgress(
        progress ?? stage?.start ?? (visible ? currentProgress : 100)
    );
    const resetProgress = visible && (
        currentProgress >= 100
        || progressValue < currentProgress - 20
    );

    return {
        message,
        visible,
        progressValue,
        resetProgress,
        trickleLimit: Math.max(
            progressValue,
            Math.min(98, (stage?.end ?? progressValue) - 1)
        )
    };
};

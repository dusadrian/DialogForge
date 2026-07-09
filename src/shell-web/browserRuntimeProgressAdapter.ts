import {
    clampWebRStartupProgress,
    createWebRStartupProgressStatusUpdate,
    defaultWebRStartupProgressMessage,
    readWebRStartupProgressFromStage
} from "../runtime/providers/webr/webRStartupProgress";

export interface BrowserRuntimeProgressControllerOptions {
    document: Document;
    window: Window;
    onStatusChange?(): void;
}

export interface BrowserRuntimeProgressController {
    setStatus(text: unknown, progress?: number): void;
    progressFromStage(message: unknown, fraction?: number): number | null;
}

export const createBrowserRuntimeProgressController = function(
    options: BrowserRuntimeProgressControllerOptions
): BrowserRuntimeProgressController {
    let runtimeProgressValue = 4;
    let runtimeProgressTrickleTimer = 0;

    const writeRuntimeProgress = function(value: unknown): void {
        const progressValue = clampWebRStartupProgress(value);
        const coverProgress = options.document.getElementById("consoleCoverProgress");

        runtimeProgressValue = Math.max(runtimeProgressValue, progressValue);

        if (coverProgress) {
            coverProgress.setAttribute("aria-valuenow", String(runtimeProgressValue));
            coverProgress.style.setProperty(
                "--console-cover-progress",
                `${runtimeProgressValue}%`
            );
        }
    };

    const stopRuntimeProgressTrickle = function(): void {
        if (runtimeProgressTrickleTimer) {
            options.window.clearInterval(runtimeProgressTrickleTimer);
            runtimeProgressTrickleTimer = 0;
        }
    };

    const startRuntimeProgressTrickle = function(limit: unknown): void {
        const maxValue = clampWebRStartupProgress(limit);

        stopRuntimeProgressTrickle();

        if (runtimeProgressValue >= maxValue) {
            return;
        }

        runtimeProgressTrickleTimer = options.window.setInterval(() => {
            if (runtimeProgressValue >= maxValue) {
                stopRuntimeProgressTrickle();
                return;
            }

            writeRuntimeProgress(runtimeProgressValue + 1);
        }, 850);
    };

    const progressFromStage = function(message: unknown, fraction = 0): number | null {
        return readWebRStartupProgressFromStage(message, fraction);
    };

    const setStatus = function(text: unknown, progress?: number): void {
        const coverMessage = options.document.getElementById("consoleCoverMessage");
        const status = createWebRStartupProgressStatusUpdate(
            text,
            progress,
            runtimeProgressValue
        );

        if (coverMessage) {
            coverMessage.textContent = status.message || defaultWebRStartupProgressMessage;
        }

        if (status.resetProgress) {
            runtimeProgressValue = 0;
        }

        writeRuntimeProgress(status.progressValue);

        if (status.visible) {
            startRuntimeProgressTrickle(status.trickleLimit);
        }
        else {
            stopRuntimeProgressTrickle();
        }

        options.document.body.classList.toggle("console-cover-visible", status.visible);
        options.onStatusChange?.();
    };

    return {
        setStatus,
        progressFromStage
    };
};

import {
    clampWebRStartupProgress,
    createWebRStartupProgressStatusUpdate,
    defaultWebRStartupProgressMessage,
    readWebRStartupProgressFromStage
} from "../runtime/providers/webr/webRStartupProgress";
import {
    createConsoleCoverController,
    type ConsoleCoverActivity
} from "../console/renderer/consoleCoverController";

export interface BrowserRuntimeProgressControllerOptions {
    document: Document;
    window: Window;
    onStatusChange?(): void;
}

export interface BrowserRuntimeProgressController {
    setStatus(text: unknown, progress?: number): void;
    revealRestartFailure(): void;
    progressFromStage(message: unknown, fraction?: number): number | null;
    beginActivity(message: unknown): () => void;
    beginProgressActivity(message: unknown): BrowserRuntimeProgressActivity;
    runActivity<Result>(
        message: unknown,
        action: () => Promise<Result>
    ): Promise<Result>;
    setActivityMessage(message: unknown): void;
}

export type BrowserRuntimeProgressActivity = ConsoleCoverActivity;

export const createBrowserRuntimeProgressController = function(
    options: BrowserRuntimeProgressControllerOptions
): BrowserRuntimeProgressController {
    let runtimeProgressValue = 4;
    let runtimeProgressTrickleTimer = 0;
    const cover = createConsoleCoverController({
        document: options.document,
        onStatusChange: options.onStatusChange,
        onActivityChange: function(progress): void {
            stopRuntimeProgressTrickle();

            if (progress !== undefined) {
                runtimeProgressValue = clampWebRStartupProgress(progress);
            }
        }
    });

    const writeRuntimeProgress = function(value: unknown): void {
        const progressValue = clampWebRStartupProgress(value);
        runtimeProgressValue = Math.max(runtimeProgressValue, progressValue);
        cover.setProgress(runtimeProgressValue);
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
        const status = createWebRStartupProgressStatusUpdate(
            text,
            progress,
            runtimeProgressValue
        );

        if (cover.hasActivities()) {
            return;
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

        cover.renderStatus(
            status.message || defaultWebRStartupProgressMessage,
            status.visible
        );
    };

    return {
        setStatus,
        revealRestartFailure: function(): void {
            stopRuntimeProgressTrickle();
            cover.renderStatus("", false);
        },
        progressFromStage,
        beginActivity: cover.beginActivity,
        beginProgressActivity: cover.beginProgressActivity,
        runActivity: cover.runActivity,
        setActivityMessage: cover.setActivityMessage
    };
};

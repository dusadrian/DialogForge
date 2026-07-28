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
    beginActivity(message: unknown): () => void;
    runActivity<Result>(
        message: unknown,
        action: () => Promise<Result>
    ): Promise<Result>;
    setActivityMessage(message: unknown): void;
}

export const createBrowserRuntimeProgressController = function(
    options: BrowserRuntimeProgressControllerOptions
): BrowserRuntimeProgressController {
    let runtimeProgressValue = 4;
    let runtimeProgressTrickleTimer = 0;
    let activityCount = 0;

    const setIndeterminateProgress = function(indeterminate: boolean): void {
        const coverProgress = options.document.getElementById("consoleCoverProgress");

        if (!coverProgress) {
            return;
        }

        coverProgress.classList.toggle("is-indeterminate", indeterminate);

        if (indeterminate) {
            coverProgress.removeAttribute("aria-valuenow");
            return;
        }

        coverProgress.setAttribute("aria-valuenow", String(runtimeProgressValue));
    };

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

        if (activityCount > 0) {
            return;
        }

        if (coverMessage) {
            coverMessage.textContent = status.message || defaultWebRStartupProgressMessage;
        }

        if (status.resetProgress) {
            runtimeProgressValue = 0;
        }

        setIndeterminateProgress(false);
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

    const setActivityMessage = function(message: unknown): void {
        if (activityCount < 1) {
            return;
        }

        const coverMessage = options.document.getElementById("consoleCoverMessage");

        if (coverMessage) {
            coverMessage.textContent = String(message || "Working...").trim() || "Working...";
        }
    };

    const beginActivity = function(message: unknown): () => void {
        activityCount += 1;
        runtimeProgressValue = 4;
        setActivityMessage(message);
        writeRuntimeProgress(runtimeProgressValue);
        stopRuntimeProgressTrickle();
        setIndeterminateProgress(true);
        options.document.body.classList.add("console-cover-visible");
        options.onStatusChange?.();

        let finished = false;

        return function(): void {
            if (finished) {
                return;
            }

            finished = true;
            activityCount = Math.max(0, activityCount - 1);

            if (activityCount === 0) {
                stopRuntimeProgressTrickle();
                setIndeterminateProgress(false);
                options.document.body.classList.remove("console-cover-visible");
                options.onStatusChange?.();
            }
        };
    };

    const runActivity = async function<Result>(
        message: unknown,
        action: () => Promise<Result>
    ): Promise<Result> {
        const endActivity = beginActivity(message);

        try {
            return await action();
        }
        finally {
            endActivity();
        }
    };

    return {
        setStatus,
        progressFromStage,
        beginActivity,
        runActivity,
        setActivityMessage
    };
};

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
    beginProgressActivity(message: unknown): BrowserRuntimeProgressActivity;
    runActivity<Result>(
        message: unknown,
        action: () => Promise<Result>
    ): Promise<Result>;
    setActivityMessage(message: unknown): void;
}

export interface BrowserRuntimeProgressActivity {
    update(message: unknown, progress?: number): void;
    end(): void;
}

export const createBrowserRuntimeProgressController = function(
    options: BrowserRuntimeProgressControllerOptions
): BrowserRuntimeProgressController {
    let runtimeProgressValue = 4;
    let runtimeProgressTrickleTimer = 0;
    const activities: Array<{ message: string; progress?: number }> = [];

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

        if (activities.length > 0) {
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

    const renderActivity = function(): void {
        stopRuntimeProgressTrickle();
        const activity = activities[activities.length - 1];

        if (!activity) {
            setIndeterminateProgress(false);
            options.document.body.classList.remove("console-cover-visible");
            options.onStatusChange?.();
            return;
        }

        const coverMessage = options.document.getElementById("consoleCoverMessage");
        if (coverMessage) {
            coverMessage.textContent = activity.message;
        }
        runtimeProgressValue = 0;
        writeRuntimeProgress(activity.progress ?? 4);
        setIndeterminateProgress(activity.progress === undefined);
        options.document.body.classList.add("console-cover-visible");
        options.onStatusChange?.();
    };

    const setActivityMessage = function(message: unknown): void {
        const activity = activities[activities.length - 1];
        if (activity) {
            activity.message = String(message || "Working...").trim() || "Working...";
            renderActivity();
        }
    };

    const beginProgressActivity = function(message: unknown): BrowserRuntimeProgressActivity {
        const activity = {
            message: String(message || "Working...").trim() || "Working...",
            progress: undefined as number | undefined
        };
        activities.push(activity);
        renderActivity();

        return {
            update(message, progress) {
                if (!activities.includes(activity)) {
                    return;
                }
                activity.message = String(message || "Working...").trim() || "Working...";
                activity.progress = progress;
                if (activities[activities.length - 1] === activity) {
                    renderActivity();
                }
            },
            end() {
                const index = activities.indexOf(activity);
                if (index < 0) {
                    return;
                }
                activities.splice(index, 1);
                renderActivity();
            }
        };
    };

    const beginActivity = function(message: unknown): () => void {
        return beginProgressActivity(message).end;
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
        beginProgressActivity,
        runActivity,
        setActivityMessage
    };
};

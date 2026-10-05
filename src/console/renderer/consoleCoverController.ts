export interface ConsoleCoverActivity {
    update(message: unknown, progress?: number): void;
    end(): void;
}


export const createConsoleCoverController = function(bindings: {
    document: Document;
    onStatusChange?(): void;
    onActivityChange?(progress?: number): void;
}) {
    const activities: Array<{ message: string; progress?: number }> = [];
    let progressValue = 4;

    const setProgress = function(value: number, indeterminate = false): void {
        progressValue = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
        const element = bindings.document.getElementById("consoleCoverProgress");

        if (!element) {
            return;
        }

        element.style.setProperty("--console-cover-progress", `${progressValue}%`);
        element.classList.toggle("is-indeterminate", indeterminate);

        if (indeterminate) {
            element.removeAttribute("aria-valuenow");
        }
        else {
            element.setAttribute("aria-valuenow", String(progressValue));
        }
    };

    const render = function(message: string | undefined, visible: boolean): void {
        const element = bindings.document.getElementById("consoleCoverMessage");

        if (element && message !== undefined) {
            element.textContent = message;
        }

        bindings.document.body.classList.toggle("console-cover-visible", visible);
        bindings.onStatusChange?.();
    };

    const renderActivity = function(): void {
        const activity = activities[activities.length - 1];
        bindings.onActivityChange?.(activity ? activity.progress ?? 4 : undefined);

        if (!activity) {
            setProgress(progressValue);
            render(undefined, false);
            return;
        }

        setProgress(activity.progress ?? 4, activity.progress === undefined);
        render(activity.message, true);
    };

    const readActivityMessage = function(message: unknown): string {
        return String(message || "Working...").trim() || "Working...";
    };

    const beginProgressActivity = function(message: unknown): ConsoleCoverActivity {
        const activity = {
            message: readActivityMessage(message),
            progress: undefined as number | undefined
        };
        activities.push(activity);
        renderActivity();

        return {
            update: function(message, progress): void {
                if (!activities.includes(activity)) {
                    return;
                }

                activity.message = readActivityMessage(message);
                activity.progress = progress;

                if (activities[activities.length - 1] === activity) {
                    renderActivity();
                }
            },
            end: function(): void {
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

    return {
        hasActivities: function(): boolean {
            return activities.length > 0;
        },
        renderStatus: function(message: string, visible: boolean): void {
            if (!activities.length) {
                render(message, visible);
            }
        },
        setProgress,
        beginActivity,
        beginProgressActivity,
        setActivityMessage: function(message: unknown): void {
            const activity = activities[activities.length - 1];

            if (activity) {
                activity.message = readActivityMessage(message);
                renderActivity();
            }
        },
        runActivity: async function<Result>(
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
        }
    };
};

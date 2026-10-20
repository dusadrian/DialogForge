import type {
    RuntimeSessionSnapshot
} from "../../runtime/provider-contract/runtimeProvider";


export interface ConsoleRuntimeSessionControllerOptions {
    getSession(): RuntimeSessionSnapshot | null;
    startRuntime(): Promise<RuntimeSessionSnapshot>;
    stopRuntime(): Promise<RuntimeSessionSnapshot>;
    applySession(snapshot: RuntimeSessionSnapshot): void;
    renderStatus(snapshot: RuntimeSessionSnapshot): void;
    refreshRuntimeEvents(): void;
    refreshPrompts(): void;
    beforeStartupTasks?(snapshot: RuntimeSessionSnapshot): Promise<void> | void;
    runStartupTasks(): Promise<void>;
    reportStartupFailure?(message: string): void;
    startupTimeoutMs?: number;
}


export interface ConsoleRuntimeSessionController {
    update(
        action: () => Promise<RuntimeSessionSnapshot>
    ): Promise<RuntimeSessionSnapshot>;
    start(): Promise<RuntimeSessionSnapshot>;
    stop(): Promise<void>;
}


export const createConsoleRuntimeSessionController = function(
    options: ConsoleRuntimeSessionControllerOptions
): ConsoleRuntimeSessionController {
    const startupTimeoutMs = options.startupTimeoutMs ?? 15000;
    let operationGeneration = 0;
    let pendingStart: Promise<RuntimeSessionSnapshot> | null = null;

    const hasNewerSession = function(snapshot: RuntimeSessionSnapshot): boolean {
        const current = options.getSession();

        return current?.providerId === snapshot.providerId
            && current.lifecycleGeneration !== undefined
            && snapshot.lifecycleGeneration !== undefined
            && current.lifecycleGeneration > snapshot.lifecycleGeneration;
    };

    const update = async function(
        action: () => Promise<RuntimeSessionSnapshot>
    ): Promise<RuntimeSessionSnapshot> {
        const snapshot = await action();

        if (hasNewerSession(snapshot)) {
            return options.getSession()!;
        }

        options.applySession(snapshot);
        options.refreshRuntimeEvents();
        options.refreshPrompts();

        return snapshot;
    };

    const performStart = async function(): Promise<RuntimeSessionSnapshot> {
        const current = options.getSession();
        const generation = ++operationGeneration;

        if (current?.status === "ready") {
            await options.beforeStartupTasks?.(current);
            await options.runStartupTasks();
            return current;
        }

        options.renderStatus({
            providerId: current?.providerId || "r",
            status: "starting",
            connection: current?.connection || "",
            message: "Runtime is starting."
        });

        let timer: ReturnType<typeof setTimeout> | undefined;
        let snapshot: RuntimeSessionSnapshot;

        try {
            snapshot = await Promise.race([
                Promise.resolve().then(options.startRuntime),
                new Promise<never>((_resolve, reject) => {
                    timer = setTimeout(function(): void {
                        reject(new Error(
                            `Runtime startup did not finish within ${
                                Math.ceil(startupTimeoutMs / 1000)
                            } seconds. `
                            + "Use Restart Clean to stop this attempt and try again."
                        ));
                    }, startupTimeoutMs);
                })
            ]);
        }
        catch (error) {
            const latest = options.getSession();

            if (
                generation !== operationGeneration
                || (current && latest && latest.providerId !== current.providerId)
                || (current?.lifecycleGeneration !== undefined
                    && latest?.lifecycleGeneration !== undefined
                    && latest.lifecycleGeneration > current.lifecycleGeneration + 1)
            ) {
                return latest || current!;
            }

            // The host's ready event can arrive while its IPC response is still
            // waiting for ancillary startup work. Keep that accepted session.
            options.reportStartupFailure?.(
                error instanceof Error ? error.message : String(error)
            );
            snapshot = latest?.status === "ready"
                ? latest
                : {
                    ...(latest || current),
                    providerId: latest?.providerId || current?.providerId || "r",
                    connection: latest?.connection || current?.connection || "",
                    status: "failed",
                    message: error instanceof Error ? error.message : String(error)
                };
        }
        finally {
            clearTimeout(timer);
        }

        if (generation !== operationGeneration || hasNewerSession(snapshot)) {
            return options.getSession() || snapshot;
        }

        options.applySession(snapshot);
        options.refreshRuntimeEvents();
        options.refreshPrompts();

        if (snapshot.status !== "ready") {
            return snapshot;
        }

        await options.beforeStartupTasks?.(snapshot);
        await options.runStartupTasks();

        return snapshot;
    };

    const stop = async function(): Promise<void> {
        operationGeneration += 1;
        pendingStart = null;
        await update(options.stopRuntime);
    };

    return {
        update,
        start: function(): Promise<RuntimeSessionSnapshot> {
            if (pendingStart) {
                return pendingStart;
            }

            const pending = performStart().finally(function(): void {
                if (pendingStart === pending) {
                    pendingStart = null;
                }
            });
            pendingStart = pending;
            return pending;
        },
        stop
    };
};

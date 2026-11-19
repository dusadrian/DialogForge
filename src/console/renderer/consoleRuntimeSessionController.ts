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
    runStartupTasks(session: RuntimeSessionSnapshot, isCurrent: () => boolean): Promise<void>;
    onStartupPendingChange?(pending: boolean): void;
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

        const finishStartup = async function(session: RuntimeSessionSnapshot): Promise<RuntimeSessionSnapshot> {
            const isCurrent = function(): boolean {
                const latest = options.getSession();
                return generation === operationGeneration && latest?.status === "ready"
                    && latest.providerId === session.providerId
                    && latest.lifecycleGeneration === session.lifecycleGeneration;
            };

            try {
                await options.beforeStartupTasks?.(session);
                if (isCurrent()) {
                    await options.runStartupTasks(session, isCurrent);
                }
                if (isCurrent()) {
                    return session;
                }
            }
            catch (error) {
                if (isCurrent()) {
                    const message = error instanceof Error ? error.message : String(error);
                    const failed = { ...session, status: "failed", message };
                    options.applySession(failed);
                    options.renderStatus(failed);
                    options.reportStartupFailure?.(message);
                    return failed;
                }
            }
            return { ...session, status: "stopped", message: "Runtime startup was superseded." };
        };

        if (current?.status === "ready") {
            return finishStartup(current);
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
                return { ...(latest || current!), status: "stopped", message: "Runtime startup was superseded." };
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
            return { ...snapshot, status: "stopped", message: "Runtime startup was superseded." };
        }

        options.applySession(snapshot);
        options.refreshRuntimeEvents();
        options.refreshPrompts();

        if (snapshot.status !== "ready") {
            return snapshot;
        }

        return finishStartup(snapshot);
    };

    const stop = async function(): Promise<void> {
        const generation = ++operationGeneration;
        pendingStart = null;
        try {
            await update(options.stopRuntime);
        }
        finally {
            if (generation === operationGeneration) {
                options.onStartupPendingChange?.(false);
            }
        }
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
                    options.onStartupPendingChange?.(false);
                }
            });
            pendingStart = pending;
            options.onStartupPendingChange?.(true);
            return pending;
        },
        stop
    };
};

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
    runStartupTasks(): Promise<void>;
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
    const update = async function(
        action: () => Promise<RuntimeSessionSnapshot>
    ): Promise<RuntimeSessionSnapshot> {
        const snapshot = await action();

        options.applySession(snapshot);
        options.refreshRuntimeEvents();
        options.refreshPrompts();

        return snapshot;
    };

    const start = async function(): Promise<RuntimeSessionSnapshot> {
        const current = options.getSession();

        if (current?.status === "ready") {
            return current;
        }

        options.renderStatus({
            providerId: current?.providerId || "r",
            status: "starting",
            connection: current?.connection || "",
            message: "Runtime is starting."
        });

        const snapshot = await update(options.startRuntime);

        await options.runStartupTasks();

        return snapshot;
    };

    const stop = async function(): Promise<void> {
        await update(options.stopRuntime);
    };

    return {
        update,
        start,
        stop
    };
};

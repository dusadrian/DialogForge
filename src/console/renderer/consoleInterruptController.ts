import type {
    RuntimeSessionSnapshot
} from "../../runtime/provider-contract/runtimeProvider";


export interface ConsoleInterruptControllerOptions {
    getRuntimeSession(): RuntimeSessionSnapshot | null;
    getActiveActivityId(): string;
    executeInterrupt(): Promise<{
        status?: string;
        message?: string;
        value?: unknown;
    }>;
    reportFailure(message: string, activityId: string): void;
}


export const createConsoleInterruptController = function(
    options: ConsoleInterruptControllerOptions
) {
    let generation = 0;
    let pending: object | null = null;

    const interrupt = async function(): Promise<void> {
        if (pending) {
            return;
        }

        const operation = {};
        const expectedGeneration = generation;
        const session = options.getRuntimeSession();
        const activityId = options.getActiveActivityId();
        const providerId = session?.providerId;
        const lifecycleGeneration = session?.lifecycleGeneration;
        const status = session?.status;
        pending = operation;

        const isCurrent = function(): boolean {
            const current = options.getRuntimeSession();
            return generation === expectedGeneration
                && current?.providerId === providerId
                && current?.lifecycleGeneration === lifecycleGeneration
                && current?.status === status;
        };

        try {
            const result = await options.executeInterrupt();
            if (!isCurrent() || (result.status === "ready" && result.value === true)) {
                return;
            }

            options.reportFailure(result.message || (
                result.status === "unavailable" || result.status === "unsupported"
                    ? "Runtime interrupt is not available."
                    : "Runtime did not accept the interrupt request."
            ), activityId);
        }
        catch (error) {
            if (isCurrent()) {
                options.reportFailure(
                    error instanceof Error ? error.message : String(error),
                    activityId
                );
            }
        }
        finally {
            if (pending === operation) {
                pending = null;
            }
        }
    };

    return {
        interrupt,
        retire(): void {
            generation += 1;
            pending = null;
        }
    };
};

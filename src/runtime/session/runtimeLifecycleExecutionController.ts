import type {
    RuntimeLifecycleController,
    RuntimeSessionSnapshot
} from "../provider-contract/runtimeProvider";
import type {
    RuntimeSessionLifecycleState
} from "./runtimeSessionLifecycleState";


export interface RuntimeLifecycleExecutionControllerOptions {
    initialMessage: string;
    lifecycleController?: RuntimeLifecycleController;
    lifecycleState: RuntimeSessionLifecycleState;
    invalidateWorkspace(): void;
    retireRuntimeResources?(): void;
    getSnapshot(): RuntimeSessionSnapshot;
}


export interface RuntimeLifecycleExecutionController {
    start(): Promise<RuntimeSessionSnapshot>;
    stop(): Promise<RuntimeSessionSnapshot>;
}


export const createRuntimeLifecycleExecutionController = function(
    options: RuntimeLifecycleExecutionControllerOptions
): RuntimeLifecycleExecutionController {
    let pendingGeneration: number | null = null;

    const recordLifecycleFailure = function(generation: number, error: unknown): void {
        options.lifecycleState.commit(generation, {
            ...options.getSnapshot(),
            status: "failed",
            message: error instanceof Error ? error.message : String(error)
        });
    };

    return {
        start: async function() {
            if (pendingGeneration === null && options.getSnapshot().status === "ready") {
                return options.getSnapshot();
            }

            const generation = options.lifecycleState.beginTransition();
            pendingGeneration = generation;
            try {
                options.invalidateWorkspace();

                if (options.lifecycleState.snapshot.connection === "missing") {
                    options.lifecycleState.reset(
                        "failed",
                        "Runtime provider is not registered."
                    );

                    return options.getSnapshot();
                }

                if (options.lifecycleController) {
                    options.lifecycleState.transition(
                        "starting",
                        "Runtime session is starting."
                    );
                    try {
                        const nextSnapshot =
                            await options.lifecycleController.start(options.getSnapshot());

                        if (!options.lifecycleState.commit(generation, nextSnapshot)) {
                            throw new Error("Runtime start was superseded by a newer lifecycle transition.");
                        }
                    } catch (error) {
                        recordLifecycleFailure(generation, error);
                        throw error;
                    }

                    return options.getSnapshot();
                }

                options.lifecycleState.reset(
                    "starting",
                    "Runtime session is starting."
                );

                options.lifecycleState.reset(
                    "ready",
                    options.initialMessage
                );

                return options.getSnapshot();
            } finally {
                if (pendingGeneration === generation) {
                    pendingGeneration = null;
                }
            }
        },
        stop: async function() {
            const generation = options.lifecycleState.beginTransition();
            pendingGeneration = generation;
            try {
                options.invalidateWorkspace();

                if (options.lifecycleController) {
                    try {
                        const nextSnapshot =
                            await options.lifecycleController.stop(options.getSnapshot());

                        if (!options.lifecycleState.commit(generation, nextSnapshot)) {
                            throw new Error("Runtime stop was superseded by a newer lifecycle transition.");
                        }
                    } catch (error) {
                        recordLifecycleFailure(generation, error);
                        throw error;
                    }
                }
                else {
                    options.lifecycleState.reset(
                        "stopped",
                        "Runtime session is stopped."
                    );
                }

                const snapshot = options.getSnapshot();

                if (snapshot.status === "stopped") {
                    options.retireRuntimeResources?.();
                }

                return snapshot;
            } finally {
                if (pendingGeneration === generation) {
                    pendingGeneration = null;
                }
            }
        }
    };
};

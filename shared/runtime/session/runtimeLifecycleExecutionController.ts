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
    getSnapshot(): RuntimeSessionSnapshot;
}


export interface RuntimeLifecycleExecutionController {
    start(): Promise<RuntimeSessionSnapshot>;
    stop(): Promise<RuntimeSessionSnapshot>;
}


export const createRuntimeLifecycleExecutionController = function(
    options: RuntimeLifecycleExecutionControllerOptions
): RuntimeLifecycleExecutionController {
    return {
        start: async function() {
            const generation = options.lifecycleState.beginTransition();
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
                const nextSnapshot =
                    await options.lifecycleController.start(options.getSnapshot());

                options.lifecycleState.commit(generation, nextSnapshot);

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
        },
        stop: async function() {
            const generation = options.lifecycleState.beginTransition();
            options.invalidateWorkspace();

            if (options.lifecycleController) {
                const nextSnapshot =
                    await options.lifecycleController.stop(options.getSnapshot());

                options.lifecycleState.commit(generation, nextSnapshot);

                return options.getSnapshot();
            }

            options.lifecycleState.reset(
                "stopped",
                "Runtime session is stopped."
            );

            return options.getSnapshot();
        }
    };
};

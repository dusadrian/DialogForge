import type { EvaluatedStartupTask } from "../../core/contracts/applicationComposition";
import type {
    RuntimeSessionSnapshot, StartupTaskExecutionRequest, StartupTaskExecutionResult
} from "../provider-contract/runtimeProvider";


export class RuntimeStartupRetiredError extends Error {}


export const runOwnedRuntimeStartupStage = async function<Result>(options: {
    isCurrent(): boolean;
    run(): Promise<Result>;
    discard?(result: Result): Promise<void> | void;
}): Promise<Result> {
    if (!options.isCurrent()) {
        throw new RuntimeStartupRetiredError("Runtime startup was retired before dispatch.");
    }

    let result: Result;
    try {
        result = await options.run();
    }
    catch (error) {
        if (!options.isCurrent()) {
            throw new RuntimeStartupRetiredError("Runtime startup was retired before completion.");
        }
        throw error;
    }
    if (!options.isCurrent()) {
        await options.discard?.(result);
        throw new RuntimeStartupRetiredError("Runtime startup was retired before completion.");
    }

    return result;
};


export const runApplicationStartupTasks = async function(options: {
    tasks: EvaluatedStartupTask[];
    session: RuntimeSessionSnapshot;
    isCurrent(): boolean;
    execute(request: StartupTaskExecutionRequest): Promise<StartupTaskExecutionResult>;
    observe?(task: EvaluatedStartupTask, result: StartupTaskExecutionResult): Promise<void> | void;
}): Promise<void> {
    for (const task of options.tasks) {
        if (!task.enabled) {
            continue;
        }

        const result = await runOwnedRuntimeStartupStage({
            isCurrent: options.isCurrent,
            run: () => options.execute({
                taskId: task.id,
                owner: task.owner || "",
                source: "base-app.startup",
                generation: options.session.lifecycleGeneration,
                automatic: true
            })
        });
        await options.observe?.(task, result);

        if (task.commands?.length && result.status !== "ready" && result.status !== "planned") {
            throw new Error(result.message || `Startup task failed: ${task.label || task.id}`);
        }
    }
};

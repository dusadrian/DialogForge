import type {
    EvaluatedStartupTask
} from "../../../core/contracts/applicationComposition";
import type {
    StartupTaskExecutionResult
} from "../../../runtime/provider-contract/runtimeProvider";


export interface MainStartupTaskControllerBindings {
    getTasks(): EvaluatedStartupTask[];
    getRunnableTasks(tasks: EvaluatedStartupTask[]): EvaluatedStartupTask[];
    renderResult(result: StartupTaskExecutionResult): void;
    shouldRefreshWorkspace(
        task: EvaluatedStartupTask,
        result: StartupTaskExecutionResult
    ): boolean;
    refreshRuntimeEvents(): Promise<void>;
    refreshWorkspace(): Promise<void>;
}


export interface MainStartupTaskController {
    execute(task: EvaluatedStartupTask): Promise<void>;
    runPending(): Promise<void>;
}


export const createMainStartupTaskController = function(
    bindings: MainStartupTaskControllerBindings
): MainStartupTaskController {
    const execute = async function(task: EvaluatedStartupTask): Promise<void> {
        const result = await window.dialogForge.executeStartupTask({
            taskId: task.id,
            owner: task.owner || "",
            source: "base-app.startup"
        });

        bindings.renderResult(result);
        await bindings.refreshRuntimeEvents();

        if (bindings.shouldRefreshWorkspace(task, result)) {
            await bindings.refreshWorkspace();
        }
    };

    const runPending = async function(): Promise<void> {
        const tasks = bindings.getRunnableTasks(bindings.getTasks());

        for (const task of tasks) {
            await execute(task);
        }
    };

    return {
        execute,
        runPending
    };
};

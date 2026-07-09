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
    execute(task: EvaluatedStartupTask): Promise<StartupTaskExecutionResult>;
    runPending(): Promise<void>;
}


export const createMainStartupTaskController = function(
    bindings: MainStartupTaskControllerBindings
): MainStartupTaskController {
    const completedTaskKeys = new Set<string>();

    const taskKey = function(task: EvaluatedStartupTask): string {
        return `${task.owner || ""}:${task.id}`;
    };

    const execute = async function(
        task: EvaluatedStartupTask
    ): Promise<StartupTaskExecutionResult> {
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

        if (result.status === "ready" || result.status === "planned") {
            completedTaskKeys.add(taskKey(task));
        }

        return result;
    };

    const runPending = async function(): Promise<void> {
        const tasks = bindings.getRunnableTasks(bindings.getTasks()).filter((task) => {
            return !completedTaskKeys.has(taskKey(task));
        });

        for (const task of tasks) {
            await execute(task);
        }
    };

    return {
        execute,
        runPending
    };
};

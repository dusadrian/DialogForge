import { runApplicationStartupTasks } from "../../../runtime/session/runtimeStartupStage";
import type { RuntimeSessionSnapshot } from "../../../runtime/provider-contract/runtimeProvider";
import type {
    EvaluatedStartupTask
} from "../../../core/contracts/applicationComposition";
import type {
    StartupTaskExecutionResult
} from "../../../runtime/provider-contract/runtimeProvider";


export interface MainStartupTaskControllerBindings {
    getSession(): RuntimeSessionSnapshot | null;
    getTasks(): EvaluatedStartupTask[];
    getRunnableTasks(tasks: EvaluatedStartupTask[]): EvaluatedStartupTask[];
    renderResult(result: StartupTaskExecutionResult): void;
    shouldRefreshWorkspace(
        task: EvaluatedStartupTask,
        result: StartupTaskExecutionResult
    ): boolean;
    refreshRuntimeEvents(isCurrent?: () => boolean): Promise<void>;
    refreshWorkspace(): Promise<void>;
}


export interface MainStartupTaskController {
    execute(task: EvaluatedStartupTask): Promise<StartupTaskExecutionResult>;
    runPending(session: RuntimeSessionSnapshot, isCurrent: () => boolean): Promise<void>;
}


export const createMainStartupTaskController = function(
    bindings: MainStartupTaskControllerBindings
): MainStartupTaskController {
    const observe = async function(
        task: EvaluatedStartupTask, result: StartupTaskExecutionResult, isCurrent: () => boolean
    ): Promise<void> {
        if (isCurrent()) {
            bindings.renderResult(result);
            await bindings.refreshRuntimeEvents(isCurrent);
        }
        if (isCurrent() && bindings.shouldRefreshWorkspace(task, result)) {
            await bindings.refreshWorkspace();
        }
    };

    return {
        async execute(task) {
            const session = bindings.getSession();
            const result = await window.dialogForge.executeStartupTask({
                taskId: task.id, owner: task.owner || "", source: "base-app.startup",
                generation: session?.lifecycleGeneration
            });
            await observe(task, result, () => {
                const current = bindings.getSession();
                return current?.status === "ready" && current.providerId === session?.providerId
                    && current.lifecycleGeneration === session.lifecycleGeneration;
            });
            return result;
        },
        runPending(session, isCurrent) {
            return runApplicationStartupTasks({
                tasks: bindings.getRunnableTasks(bindings.getTasks()), session, isCurrent,
                execute: request => window.dialogForge.executeStartupTask(request),
                observe: (task, result) => observe(task, result, isCurrent)
            });
        }
    };
};

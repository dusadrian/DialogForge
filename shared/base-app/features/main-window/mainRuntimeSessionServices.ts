import type {
    EvaluatedStartupTask
} from "../../../core/contracts/applicationComposition";
import type {
    PromptSnapshot,
    RuntimeEventSnapshot,
    RuntimeSessionSnapshot,
    StartupTaskExecutionResult
} from "../../../runtime/provider-contract/runtimeProvider";
import {
    createConsoleRuntimeSessionController
} from "../../../console/renderer/consoleRuntimeSessionController";
import {
    createMainPromptController
} from "../runtime-panels/mainPromptController";
import {
    createMainStartupTaskController
} from "../runtime-panels/mainStartupTaskController";
import {
    startupPromptPanelApi
} from "../runtime-panels/startupPromptPanel";


export interface MainRuntimeSessionServicesOptions {
    dialogForge: DialogForgeApi;
    promptText: HTMLInputElement;
    promptAnswer: HTMLInputElement;
    getPromptSnapshot(): PromptSnapshot | null;
    getStartupTasks(): EvaluatedStartupTask[];
    getRuntimeSession(): RuntimeSessionSnapshot | null;
    renderPrompts(snapshot: PromptSnapshot): void;
    renderStartupTaskResult(result: StartupTaskExecutionResult): void;
    renderRuntimeEvents(snapshot: RuntimeEventSnapshot): void;
    renderRuntimeSession(snapshot: RuntimeSessionSnapshot): void;
    renderConsoleStatus(snapshot: RuntimeSessionSnapshot): void;
    refreshWorkspace(): Promise<void>;
}


export const createMainRuntimeSessionServices = function(
    options: MainRuntimeSessionServicesOptions
) {
    const refreshRuntimeEvents = async function(): Promise<void> {
        const snapshot = await options.dialogForge.listRuntimeEvents();

        options.renderRuntimeEvents(snapshot);
    };
    const promptController = createMainPromptController({
        promptText: options.promptText,
        promptAnswer: options.promptAnswer,
        getSnapshot: options.getPromptSnapshot,
        findPendingPrompt: startupPromptPanelApi.findPendingPrompt,
        renderPrompts: options.renderPrompts
    });
    const startupTaskController = createMainStartupTaskController({
        getTasks: options.getStartupTasks,
        getRunnableTasks: startupPromptPanelApi.getRunnableStartupTasks,
        renderResult: options.renderStartupTaskResult,
        shouldRefreshWorkspace:
            startupPromptPanelApi.shouldRefreshWorkspaceAfterStartupTask,
        refreshRuntimeEvents,
        refreshWorkspace: options.refreshWorkspace
    });
    const runtimeSessionController = createConsoleRuntimeSessionController({
        getSession: options.getRuntimeSession,
        startRuntime: options.dialogForge.startRuntime,
        stopRuntime: options.dialogForge.stopRuntime,
        applySession: function(snapshot): void {
            options.renderRuntimeSession(snapshot);
            options.renderConsoleStatus(snapshot);
        },
        renderStatus: options.renderConsoleStatus,
        refreshRuntimeEvents: function(): void {
            void refreshRuntimeEvents();
        },
        refreshPrompts: function(): void {
            void promptController.refresh();
        },
        runStartupTasks: startupTaskController.runPending
    });

    return {
        refreshRuntimeEvents,
        refreshPrompts: promptController.refresh,
        startRuntimeSession: runtimeSessionController.start,
        stopRuntimeSession: runtimeSessionController.stop,
        queuePrompt: promptController.queue,
        answerFirstPrompt: promptController.answerFirst,
        executeStartupTask: startupTaskController.execute
    };
};

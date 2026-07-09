import type {
    EvaluatedStartupTask
} from "../../../core/contracts/applicationComposition";
import type {
    PromptRecord,
    PromptSnapshot,
    StartupTaskExecutionResult
} from "../../../runtime/provider-contract/runtimeProvider";


interface StartupPromptHelpers {
    appendField(host: HTMLElement, label: string, value: unknown): void;
    empty(host: HTMLElement): void;
    setStatusClass(element: HTMLElement, enabled: boolean): void;
}


const findPendingPrompt = function(snapshot: PromptSnapshot | null): PromptRecord | null {
    if (!snapshot) {
        return null;
    }

    return snapshot.prompts.find((prompt) => {
        return prompt.status === "pending";
    }) || null;
};


export const getRunnableStartupTasks = function(tasks: EvaluatedStartupTask[]): EvaluatedStartupTask[] {
    return tasks.filter((task) => {
        return task.enabled === true;
    });
};


export const shouldRefreshWorkspaceAfterStartupTask = function(
    task: EvaluatedStartupTask,
    result: StartupTaskExecutionResult
): boolean {
    return result.status === "ready" && (task.requiredRuntime || []).includes("workspace.objects");
};


const renderPrompts = function(
    documentRef: Document,
    status: HTMLElement,
    list: HTMLElement,
    snapshot: PromptSnapshot,
    helpers: StartupPromptHelpers
): void {
    helpers.empty(status);
    helpers.empty(list);

    helpers.appendField(status, "status", snapshot.status);
    helpers.appendField(status, "provider", snapshot.providerId);
    helpers.appendField(status, "message", snapshot.message);

    snapshot.prompts.slice(0, 6).forEach((prompt) => {
        const item = documentRef.createElement("li");

        helpers.appendField(item, "id", prompt.id);
        helpers.appendField(item, "prompt", prompt.prompt);
        helpers.appendField(item, "status", prompt.status);
        helpers.appendField(item, "answer", prompt.answer);
        list.appendChild(item);
    });
};


const renderStartupTasks = function(
    documentRef: Document,
    list: HTMLElement,
    tasks: EvaluatedStartupTask[],
    runTask: (task: EvaluatedStartupTask) => void,
    helpers: StartupPromptHelpers
): void {
    helpers.empty(list);

    tasks.forEach((task) => {
        const item = documentRef.createElement("li");
        const label = documentRef.createElement("span");
        const status = documentRef.createElement("span");
        const runButton = documentRef.createElement("button");

        label.textContent = task.label || task.id;
        status.className = "status";
        status.textContent = task.enabled ? "enabled" : "disabled";
        helpers.setStatusClass(status, task.enabled);

        item.appendChild(label);
        item.appendChild(status);
        helpers.appendField(item, "status", task.status);
        helpers.appendField(item, "replacement", task.replacement);

        runButton.className = "inlineButton";
        runButton.type = "button";
        runButton.textContent = "Run";
        runButton.disabled = !task.enabled;
        runButton.addEventListener("click", () => {
            runTask(task);
        });
        item.appendChild(runButton);

        if (!task.enabled && task.missing.length > 0) {
            const missing = documentRef.createElement("div");

            missing.className = "missing";
            missing.textContent = "missing: " + task.missing.join(", ");
            item.appendChild(missing);
        }

        list.appendChild(item);
    });
};


const renderStartupTaskResult = function(
    status: HTMLElement,
    result: StartupTaskExecutionResult,
    helpers: StartupPromptHelpers
): void {
    helpers.empty(status);

    helpers.appendField(status, "task", result.taskId);
    helpers.appendField(status, "owner", result.owner);
    helpers.appendField(status, "status", result.status);
    helpers.appendField(status, "message", result.message);
};


export const startupPromptPanelApi = {
    findPendingPrompt,
    getRunnableStartupTasks,
    renderPrompts,
    renderStartupTaskResult,
    renderStartupTasks,
    shouldRefreshWorkspaceAfterStartupTask
};

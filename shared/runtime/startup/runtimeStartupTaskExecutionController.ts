import type {
    EvaluatedStartupTask
} from "../../core/contracts/applicationComposition";
import {
    createVisibleCommandRequest
} from "../commands/commandProtocol";
import {
    createDependencyCheckRequest
} from "../dependencies/dependencyProtocol";
import type {
    DependencyCheckRequest,
    DependencyCheckResult,
    StartupTaskExecutionRequest,
    StartupTaskExecutionResult,
    TranscriptEvent,
    VisibleCommandRequest,
    WorkspaceSnapshot
} from "../provider-contract/runtimeProvider";
import {
    createStartupTaskExecutionResult
} from "./startupTaskProtocol";


export interface RuntimeStartupTaskExecutionControllerOptions {
    checkDependencies(
        request: DependencyCheckRequest
    ): Promise<DependencyCheckResult>;
    listWorkspaceObjects(): Promise<WorkspaceSnapshot>;
    executeVisibleCommand(
        request: VisibleCommandRequest
    ): Promise<TranscriptEvent[]>;
    recordRuntimeEvent(
        type: string,
        objectName: string,
        detail: string,
        payload: Record<string, unknown>
    ): void;
}


export interface RuntimeStartupTaskExecutionController {
    execute(
        providerId: string,
        task: EvaluatedStartupTask,
        request: StartupTaskExecutionRequest
    ): Promise<StartupTaskExecutionResult>;
}


export const createRuntimeStartupTaskExecutionController = function(
    options: RuntimeStartupTaskExecutionControllerOptions
): RuntimeStartupTaskExecutionController {
    const execute = async function(
        providerId: string,
        task: EvaluatedStartupTask,
        request: StartupTaskExecutionRequest
    ): Promise<StartupTaskExecutionResult> {
        let executedRequirement = false;
        let dependencyStatus = "";
        let dependencyMessage = "";
        let workspaceMessage = "";
        const commandMessages: string[] = [];

        if ((task.rPackages || []).length > 0) {
            const dependencies = await options.checkDependencies(
                createDependencyCheckRequest({
                    kind: "package",
                    names: task.rPackages || [],
                    source: request.source || "startup.task"
                })
            );
            executedRequirement = true;
            dependencyStatus = dependencies.status;
            dependencyMessage = dependencies.message;

            options.recordRuntimeEvent(
                "startup.task.executed",
                "",
                "Startup task checked runtime package dependencies.",
                {
                    taskId: task.id,
                    owner: task.owner || "",
                    source: request.source,
                    dependencyStatus: dependencies.status
                }
            );
        }

        if ((task.requiredRuntime || []).includes("workspace.objects")) {
            const workspace = await options.listWorkspaceObjects();
            executedRequirement = true;
            workspaceMessage =
                "Startup task refreshed " + workspace.objects.length +
                " workspace object(s).";

            options.recordRuntimeEvent(
                "startup.task.executed",
                "",
                "Startup task refreshed provider workspace objects.",
                {
                    taskId: task.id,
                    owner: task.owner || "",
                    source: request.source,
                    objectCount: workspace.objects.length
                }
            );
        }

        const canRunStartupCommands =
            !dependencyStatus || dependencyStatus === "ready";

        for (const command of canRunStartupCommands ? task.commands || [] : []) {
            const text = String(command?.text || "").trim();

            if (!text) {
                continue;
            }

            const events = await options.executeVisibleCommand(
                createVisibleCommandRequest({
                    text,
                    source: `${request.source || "startup.task"}.${task.id}`
                })
            );
            const failure = events.find((event) => {
                return event.type === "error" || event.type === "rejected";
            });

            executedRequirement = true;
            commandMessages.push(
                failure
                    ? String(failure.message || `Startup command failed: ${text}`)
                    : `Executed startup command: ${text}`
            );

            if (failure) {
                dependencyStatus = "failed";
            }
        }

        if (executedRequirement) {
            const messages = [
                dependencyMessage,
                workspaceMessage,
                ...commandMessages
            ].filter((message) => {
                return Boolean(message);
            });

            return createStartupTaskExecutionResult({
                status:
                    dependencyStatus && dependencyStatus !== "ready"
                        ? dependencyStatus
                        : "ready",
                providerId,
                taskId: task.id,
                owner: task.owner || "",
                message: messages.join(" ")
            });
        }

        options.recordRuntimeEvent(
            "startup.task.executed",
            "",
            "Placeholder startup task executed.",
            {
                taskId: task.id,
                owner: task.owner || "",
                source: request.source
            }
        );

        return createStartupTaskExecutionResult({
            status: "planned",
            providerId,
            taskId: task.id,
            owner: task.owner || "",
            message: task.replacement || "Placeholder startup task executed."
        });
    };

    return {
        execute
    };
};

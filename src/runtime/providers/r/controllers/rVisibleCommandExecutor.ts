import {
    createTranscriptEvent
} from "../../../commands/commandProtocol";
import type {
    RuntimeCommandController,
    RuntimeCommandExecutionResult,
    RuntimeSessionSnapshot,
    TranscriptEvent,
    VisibleCommandRequest
} from "../../../provider-contract/runtimeProvider";
import {
    workspaceUpdateHasChanges
} from "../../../workspace/workspaceUpdate";
import type {
    RRuntimeControlClient
} from "../protocol/runtimeControlClient";
import {
    asRuntimeControlArray,
    asRuntimeControlObject,
    createTranscriptEventsFromRuntimeControl
} from "../protocol/runtimeControlEvents";
import {
    createRWorkspaceUpdate
} from "./rWorkspaceUpdate";


export interface RVisibleCommandExecutorOptions {
    getClient(): RRuntimeControlClient | null;
    createRequestId(prefix: string): string;
    resolveParentId?(
        request: VisibleCommandRequest,
        snapshot: RuntimeSessionSnapshot
    ): string;
    onRuntimeControlEvents?(
        events: unknown[] | undefined,
        snapshot: RuntimeSessionSnapshot
    ): void;
    onExecutionStarted?(
        request: VisibleCommandRequest,
        parentId: string
    ): void;
    onExecutionFinished?(): void;
}


const isCommentOnlyRInput = function(commandText: string): boolean {
    const text = String(commandText || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");

    if (!text.trim()) {
        return true;
    }

    return text.split("\n").every((line) => {
        const trimmed = line.trim();

        return !trimmed || trimmed.startsWith("#");
    });
};


const workspaceUpdateFromEvents = function(
    events: unknown[] | undefined,
    parentId: string
) {
    const workspaceEvent = asRuntimeControlArray(events).find((event) => {
        const value = asRuntimeControlObject(event);

        return value.type === "workspace_update" && value.parent_id === parentId;
    });

    if (!workspaceEvent) {
        const completion = asRuntimeControlArray(events).find((event) => {
            const value = asRuntimeControlObject(event);

            return value.type === "completion" && value.parent_id === parentId;
        });
        const value = asRuntimeControlObject(completion);

        if (value.workspaceReconciliation !== "unchanged") {
            return null;
        }

        const receipt = createRWorkspaceUpdate({
            workspaceRevision: value.workspaceRevision,
            objectCount: value.workspaceObjectCount
        });

        return receipt.workspaceRevision ? receipt : null;
    }

    const update = createRWorkspaceUpdate(
        asRuntimeControlObject(workspaceEvent).update
    );

    return workspaceUpdateHasChanges(update) ? update : null;
};


const workspaceReconciliationFromEvents = function(
    events: unknown[] | undefined,
    parentId: string
): RuntimeCommandExecutionResult["workspaceReconciliation"] {
    const completion = asRuntimeControlArray(events).find((event) => {
        const value = asRuntimeControlObject(event);

        return value.type === "completion" && value.parent_id === parentId;
    });
    const outcome = asRuntimeControlObject(completion).workspaceReconciliation;

    if (outcome === "unchanged" || outcome === "changed" || outcome === "failed") {
        return outcome;
    }

    return "not_checked";
};


export const createRVisibleCommandExecutor = function(
    options: RVisibleCommandExecutorOptions
): RuntimeCommandController {
    return {
        executeVisibleCommand: async function(
            request: VisibleCommandRequest,
            snapshot: RuntimeSessionSnapshot
        ): Promise<RuntimeCommandExecutionResult> {
            if (isCommentOnlyRInput(request.text)) {
                return {
                    transcriptEvents: [
                        createTranscriptEvent("submitted", request),
                        createTranscriptEvent("completed", request, {
                            state: "idle"
                        })
                    ],
                    workspaceUpdate: null,
                    // No R code was executed for blank or comment-only input.
                    workspaceReconciliation: "unchanged"
                };
            }

            const client = options.getClient();

            if (!client) {
                return {
                    transcriptEvents: [
                        createTranscriptEvent("rejected", request, {
                            message: "R runtime-control session is not attached."
                        })
                    ],
                    workspaceUpdate: null
                };
            }

            const parentId = options.resolveParentId?.(request, snapshot)
                || options.createRequestId("visible-command-activity");
            options.onExecutionStarted?.(request, parentId);

            const result = await client.execute({
                id: options.createRequestId("visible-command"),
                method: "execute_input",
                params: {
                    code: request.text,
                    parentId,
                    mode: "interactive",
                    outputWidth: request.outputWidth
                }
            }).finally(() => {
                options.onExecutionFinished?.();
            });

            if (options.getClient() !== client) {
                return {
                    activityId: parentId,
                    transcriptEvents: [],
                    workspaceUpdate: null,
                    workspaceReconciliation: "not_checked"
                };
            }

            options.onRuntimeControlEvents?.(result.events, snapshot);

            const transcriptEvents: TranscriptEvent[] =
                createTranscriptEventsFromRuntimeControl(
                    result.events,
                    request,
                    parentId
                );

            if (result.ok && transcriptEvents.length > 0) {
                return {
                    activityId: parentId,
                    transcriptEvents,
                    workspaceUpdate: workspaceUpdateFromEvents(result.events, parentId),
                    workspaceReconciliation: workspaceReconciliationFromEvents(
                        result.events,
                        parentId
                    )
                };
            }

            return {
                transcriptEvents: [
                    createTranscriptEvent("submitted", request),
                    createTranscriptEvent("failed", request, {
                        message: String(
                            result.error || "R command execution failed."
                        )
                    })
                ],
                activityId: parentId,
                workspaceUpdate: null
            };
        }
    };
};

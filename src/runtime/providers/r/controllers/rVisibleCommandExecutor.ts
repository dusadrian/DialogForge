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


const workspaceUpdateFromEvents = function(events: unknown[] | undefined) {
    const workspaceEvent = asRuntimeControlArray(events).find((event) => {
        return String(asRuntimeControlObject(event).type || "") ===
            "workspace_update";
    });

    if (!workspaceEvent) {
        return null;
    }

    const update = createRWorkspaceUpdate(
        asRuntimeControlObject(workspaceEvent).update
    );

    return workspaceUpdateHasChanges(update) ? update : null;
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
                    workspaceUpdate: null
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

            options.onRuntimeControlEvents?.(result.events, snapshot);

            const transcriptEvents: TranscriptEvent[] =
                createTranscriptEventsFromRuntimeControl(
                    result.events,
                    request,
                    parentId
                );

            if (result.ok && transcriptEvents.length > 0) {
                return {
                    transcriptEvents,
                    workspaceUpdate: workspaceUpdateFromEvents(result.events)
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
                workspaceUpdate: null
            };
        }
    };
};

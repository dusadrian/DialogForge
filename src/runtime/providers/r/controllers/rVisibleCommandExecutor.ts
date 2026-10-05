import {
    createTranscriptEvent,
    transcriptHasFailure
} from "../../../commands/commandProtocol";
import type {
    RuntimeCommandController,
    RuntimeCommandExecutionResult,
    RuntimeSessionSnapshot,
    TranscriptEvent,
    VisibleCommandRequest,
    WorkspaceUpdate
} from "../../../provider-contract/runtimeProvider";
import type {
    RRuntimeControlClient,
    RRuntimeControlResponse
} from "../protocol/runtimeControlClient";
import {
    asRuntimeControlArray,
    asRuntimeControlObject,
    type RRuntimeCommandCompletionMarker,
    readRuntimeEvaluationOutcome,
    readRuntimeCommandCompletionMarker,
    createTranscriptEventsFromRuntimeControl
} from "../protocol/runtimeControlEvents";
import {
    createRWorkspaceUpdate,
    hasValidRWorkspaceReconciliationPayload,
    hasValidRWorkspaceRevision
} from "./rWorkspaceUpdate";


export interface RVisibleCommandExecutorOptions {
    onTranscriptEvents?(events: TranscriptEvent[]): void;
    prepareOutputCapture?(
        request: VisibleCommandRequest, parentId: string, client: RRuntimeControlClient
    ): {
        params: Record<string, unknown>;
        onDispatched(): void;
        finish(response: RRuntimeControlResponse): Promise<RRuntimeControlResponse>;
        retire(): Promise<void>;
    } | null;
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
    onExecutionFinished?(parentId: string): void;
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


const hasCheckedWorkspaceCompletionReceipt = function(
    completion: Record<string, unknown>
): boolean {
    return hasValidRWorkspaceRevision(completion.workspaceRevision)
        && typeof completion.workspaceObjectCount === "number"
        && Number.isSafeInteger(completion.workspaceObjectCount)
        && completion.workspaceObjectCount >= 0;
};


const readCommandWorkspaceReconciliation = function(
    events: unknown[] | undefined,
    parentId: string,
    completionMarker: RRuntimeCommandCompletionMarker
): {
    workspaceReconciliation: RuntimeCommandExecutionResult["workspaceReconciliation"];
    workspaceUpdate: WorkspaceUpdate | null;
} {
    const completionRecord = asRuntimeControlObject(completionMarker.completion);
    const outcome = completionRecord.workspaceReconciliation;
    const workspaceEvents = asRuntimeControlArray(events).map(asRuntimeControlObject)
        .filter((event) => {
            return event.type === "workspace_update" && event.parent_id === parentId;
        });
    const payload = workspaceEvents.length === 1 ? workspaceEvents[0].update : null;

    if (
        workspaceEvents.length > 1
        || (workspaceEvents.length === 1 && !hasValidRWorkspaceReconciliationPayload(payload))
        || outcome === "failed"
    ) {
        return { workspaceReconciliation: "failed", workspaceUpdate: null };
    }

    if (workspaceEvents.length === 1) {
        const update = createRWorkspaceUpdate(payload);
        if (hasCheckedWorkspaceCompletionReceipt(completionRecord)) {
            const revision = asRuntimeControlObject(completionRecord.workspaceRevision);
            if (
                revision.session !== update.workspaceRevision?.session
                || revision.sequence !== update.workspaceRevision?.sequence
                || completionRecord.workspaceObjectCount !== update.objectCount
            ) {
                return { workspaceReconciliation: "failed", workspaceUpdate: null };
            }
        }
        return {
            workspaceReconciliation: outcome === "unchanged" || outcome === "changed"
                ? outcome : "not_checked",
            workspaceUpdate: update
        };
    }

    if (
        (completionMarker.status === "invalid" && !completionMarker.completion)
        || outcome === "changed"
        || (outcome === "unchanged" && !hasCheckedWorkspaceCompletionReceipt(completionRecord))
    ) {
        return { workspaceReconciliation: "failed", workspaceUpdate: null };
    }

    if (outcome === "unchanged") {
        return {
            workspaceReconciliation: "unchanged",
            workspaceUpdate: createRWorkspaceUpdate({
                workspaceRevision: completionRecord.workspaceRevision,
                objectCount: completionRecord.workspaceObjectCount
            })
        };
    }

    return { workspaceReconciliation: "not_checked", workspaceUpdate: null };
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
                    evaluationOutcome: "success",
                    // No R code was executed for blank or comment-only input.
                    workspaceReconciliation: "unchanged"
                };
            }

            const client = options.getClient();

            if (!client) {
                return {
                    executionDisposition: "not_started",
                    workspaceReconciliation: "not_checked",
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
            let dispatched = false;
            const outputCapture = options.prepareOutputCapture?.(request, parentId, client);
            let finishResponseDelivery: (() => void) | null = null;
            const responseDelivery = outputCapture ? new Promise<void>((resolve) => {
                finishResponseDelivery = resolve;
            }) : null;

            let execution: Promise<RRuntimeControlResponse>;
            try {
                execution = client.execute({
                    id: options.createRequestId("visible-command"),
                    method: "execute_input",
                    params: {
                        ...outputCapture?.params,
                        code: request.text,
                        parentId,
                        mode: "interactive",
                        outputWidth: request.outputWidth
                    }
                }, {
                    waitForResponseDelivery: responseDelivery ? () => responseDelivery : undefined,
                    onDispatched: function(): void {
                        dispatched = true;
                        options.onExecutionStarted?.(request, parentId);
                        options.onTranscriptEvents?.([
                            createTranscriptEvent("submitted", request, {
                                id: options.createRequestId("dispatched-input"),
                                parentId
                            })
                        ]);
                        outputCapture?.onDispatched();
                    }
                });
            } catch (error) {
                // Keep synchronous dispatch exceptions on the same cleanup path,
                // without deferring admission or payload capture to another turn.
                execution = Promise.reject(error);
            }
            const pendingResponse = outputCapture
                ? execution.then((response) => outputCapture.finish(response)) : execution;
            const cleanupTranscriptEvents: TranscriptEvent[] = [];
            const releaseCommandDelivery = async function(): Promise<void> {
                let cleanupFailed = false;
                let cleanupFailure: unknown;
                try {
                    await outputCapture?.retire();
                } catch (error) {
                    cleanupFailed = true;
                    cleanupFailure = error;
                }
                try {
                    if (dispatched && options.getClient() === client) {
                        options.onExecutionFinished?.(parentId);
                    }
                } catch (error) {
                    if (!cleanupFailed) {
                        cleanupFailed = true;
                        cleanupFailure = error;
                    }
                } finally {
                    finishResponseDelivery?.();
                }
                if (cleanupFailed) {
                    throw cleanupFailure;
                }
            };
            const result = await pendingResponse.then(async function(response) {
                try {
                    await releaseCommandDelivery();
                } catch {
                    // The R response is already known. Preserve its evaluation/
                    // workspace facts and report cleanup as a separate app failure.
                    cleanupTranscriptEvents.push(
                        createTranscriptEvent("output", request, {
                            parentId, streamName: "stderr",
                            message: "\nCommand cleanup failed.\n"
                        }),
                        createTranscriptEvent("failed", request, { parentId })
                    );
                }
                return response;
            }, async function(error) {
                try {
                    await releaseCommandDelivery();
                } catch {
                    // An execution/delivery exception remains the primary
                    // failure even when resource/context cleanup also fails.
                }
                throw error;
            });

            if (options.getClient() !== client) {
                return {
                    activityId: parentId,
                    executionDisposition: dispatched ? "session_lost" : "not_started",
                    transcriptEvents: [],
                    workspaceUpdate: null,
                    workspaceReconciliation: "not_checked"
                };
            }

            if (result.requestRejected) {
                return {
                    activityId: parentId,
                    executionDisposition: "not_started",
                    workspaceReconciliation: "not_checked",
                    workspaceUpdate: null,
                    transcriptEvents: [
                        createTranscriptEvent("rejected", request, {
                            message: String(result.error || "R command was not sent.")
                        }),
                        ...cleanupTranscriptEvents
                    ]
                };
            }

            if (result.ok) {
                options.onRuntimeControlEvents?.(result.events, snapshot);
            }

            const transcriptEvents: TranscriptEvent[] =
                createTranscriptEventsFromRuntimeControl(
                    result.events,
                    request,
                    parentId
                );

            const completionMarker = readRuntimeCommandCompletionMarker(result.events, parentId);
            if (
                result.ok
                && completionMarker.status !== "valid"
                && !transcriptHasFailure(transcriptEvents)
            ) {
                // Transport acceptance and output alone do not prove command
                // completion. Keep independent evaluation/workspace facts.
                transcriptEvents.push(
                    createTranscriptEvent("output", request, {
                        parentId, streamName: "stderr",
                        message: completionMarker.status === "missing"
                            ? "\nR command response has no matching completion.\n"
                            : "\nR command response has an invalid completion marker.\n"
                    }),
                    createTranscriptEvent("failed", request, { parentId })
                );
            }

            if (result.ok && transcriptEvents.length > 0) {
                const workspaceResult = readCommandWorkspaceReconciliation(
                    result.events, parentId, completionMarker
                );
                return {
                    activityId: parentId,
                    evaluationOutcome: readRuntimeEvaluationOutcome(result.events, parentId),
                    transcriptEvents: [...transcriptEvents, ...cleanupTranscriptEvents],
                    workspaceUpdate: workspaceResult.workspaceUpdate,
                    workspaceReconciliation: workspaceResult.workspaceReconciliation
                };
            }

            return {
                executionDisposition: result.transportFailure
                    ? dispatched ? "session_lost" : "not_started"
                    : undefined,
                evaluationOutcome: readRuntimeEvaluationOutcome(result.events, parentId),
                workspaceReconciliation: result.transportFailure
                    ? dispatched ? "failed" : "not_checked"
                    : result.completionFailure ? "failed" : undefined,
                transcriptEvents: [
                    ...(transcriptEvents.length > 0
                        ? transcriptEvents
                        : [createTranscriptEvent("submitted", request)]),
                    createTranscriptEvent(
                        result.transportFailure && !dispatched ? "rejected" : "failed",
                        request, {
                            message: String(
                                result.error || "R command execution failed."
                            )
                        }
                    ),
                    ...cleanupTranscriptEvents
                ],
                activityId: parentId,
                workspaceUpdate: null
            };
        }
    };
};

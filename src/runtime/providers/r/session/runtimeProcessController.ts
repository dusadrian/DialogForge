import {
    createTranscriptEvent,
    createVisibleCommandRequest
} from "../../../commands/commandProtocol";
import type {
    RuntimeCommandController,
    RuntimeExtensionController,
    RuntimeImportController,
    RuntimeLifecycleController,
    RuntimeEventController,
    RuntimeCommandExecutionResult,
    RuntimeProductCommandController,
    RuntimeQueryController,
    RuntimeTabularController,
    RuntimeToolController,
    RuntimeSessionSnapshot,
    RuntimeWorkspaceController,
    TranscriptEvent,
    VisibleCommandRequest,
    RuntimeEventRecord
} from "../../../provider-contract/runtimeProvider";
import {
    createRuntimeControlClient,
} from "../protocol/runtimeControlClient";
import {
    asRuntimeControlArray,
    asRuntimeControlObject,
    createProviderRuntimeEvent,
    createTranscriptEventsFromRuntimeControl
} from "../protocol/runtimeControlEvents";
import {
    workspaceUpdateHasChanges
} from "../../../workspace/workspaceUpdate";
import {
    createRWorkspaceUpdate
} from "../controllers/rWorkspaceUpdate";
import { createRRuntimeProcessHost } from "./runtimeProcessHost";
import {
    createRRuntimeControllerSet
} from "../controllers/rRuntimeControllerSet";
import type { RRuntimeLaunchPlan } from "./runtimeLaunchPlan";


export interface RRuntimeProcessControllerOptions {
    createLaunchPlan: () => RRuntimeLaunchPlan | Promise<RRuntimeLaunchPlan>;
    startupTimeoutMs?: number;
    onTranscriptEvents?: (events: TranscriptEvent[]) => void;
    onUnexpectedExit?: (details: {
        code: number | null;
        signal: NodeJS.Signals | null;
        output: string;
    }) => void;
}


export interface RRuntimeProcessController {
    lifecycleController: RuntimeLifecycleController;
    commandController: RuntimeCommandController;
    workspaceController: RuntimeWorkspaceController;
    tabularController: RuntimeTabularController;
    importController: RuntimeImportController;
    toolController: RuntimeToolController;
    queryController: RuntimeQueryController;
    productCommandController: RuntimeProductCommandController;
    extensionController: RuntimeExtensionController;
    eventController: RuntimeEventController;
}


const createRequestId = function(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
};


const transcriptHasFailure = function(transcriptEvents: TranscriptEvent[]): boolean {
    return transcriptEvents.some((event) => {
        return event.type === "failed" || event.type === "rejected";
    });
};


const isCommentOnlyRInput = function(commandText: string): boolean {
    const text = String(commandText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    if (!text.trim()) {
        return true;
    }

    return text.split("\n").every((line) => {
        const trimmed = line.trim();

        return !trimmed || trimmed.startsWith("#");
    });
};


export const createRRuntimeProcessController = function(
    options: RRuntimeProcessControllerOptions
): RRuntimeProcessController {
    let client: ReturnType<typeof createRuntimeControlClient> | null = null;
    const startupTimeoutMs = options.startupTimeoutMs ?? 7000;
    const providerRuntimeEvents: RuntimeEventRecord[] = [];
    let activeVisibleCommand: {
        request: VisibleCommandRequest;
        parentId: string;
    } | null = null;

    const recordRuntimeControlEvents = function(
        events: unknown[] | undefined,
        snapshot: RuntimeSessionSnapshot
    ): void {
        asRuntimeControlArray(events).forEach((event) => {
            const runtimeEvent = createProviderRuntimeEvent(event, snapshot);

            if (
                runtimeEvent
                && runtimeEvent.type !== "workspace.update"
            ) {
                providerRuntimeEvents.unshift(runtimeEvent);
            }
        });

        if (providerRuntimeEvents.length > 40) {
            providerRuntimeEvents.length = 40;
        }
    };

    const streamRuntimeControlEvent = function(event: unknown): void {
        if (!activeVisibleCommand || !options.onTranscriptEvents) {
            return;
        }

        const events = createTranscriptEventsFromRuntimeControl(
            [event],
            activeVisibleCommand.request,
            activeVisibleCommand.parentId
        );

        if (events.length > 0) {
            options.onTranscriptEvents(events);
        }
    };

    const workspaceUpdateFromEvents = function(
        events: unknown[] | undefined
    ) {
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

    const executeVisibleRCommandWithEffects = async function(
        commandText: string,
        source: string,
        snapshot: RuntimeSessionSnapshot,
        outputWidth?: number
    ): Promise<RuntimeCommandExecutionResult> {
        const request = createVisibleCommandRequest({
            text: commandText,
            source,
            outputWidth
        });

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

        const parentId = createRequestId("visible-command-activity");
        activeVisibleCommand = {
            request,
            parentId
        };

        const result = await client.execute({
            id: createRequestId("visible-command"),
            method: "execute_input",
            params: {
                code: request.text,
                parentId,
                mode: "interactive",
                outputWidth: request.outputWidth
            }
        }).finally(() => {
            activeVisibleCommand = null;
        });

        recordRuntimeControlEvents(result.events, snapshot);

        const liveTranscript = createTranscriptEventsFromRuntimeControl(result.events, request, parentId);

        if (result.ok && liveTranscript.length > 0) {
            return {
                transcriptEvents: liveTranscript,
                workspaceUpdate: workspaceUpdateFromEvents(result.events)
            };
        }

        return {
            transcriptEvents: [
                createTranscriptEvent("submitted", request),
                createTranscriptEvent("failed", request, {
                    message: String(result.error || "R command execution failed.")
                })
            ],
            workspaceUpdate: null
        };
    };

    const processHost = createRRuntimeProcessHost({
        createLaunchPlan: options.createLaunchPlan,
        startupTimeoutMs,
        onClientChanged: (nextClient) => {
            client = nextClient;
        },
        onRuntimeEvent: streamRuntimeControlEvent,
        onUnexpectedExit: options.onUnexpectedExit
    });

    const runtimeControllers = createRRuntimeControllerSet({
        getClient: function() {
            return client;
        },
        createRequestId,
        executeVisibleCommand: executeVisibleRCommandWithEffects,
        transcriptHasFailure,
        interrupt: processHost.interrupt
    });

    return {
        lifecycleController: {
            start: processHost.start,
            stop: processHost.stop
        },
        ...runtimeControllers,
        eventController: {
            listRuntimeEvents: async function(): Promise<RuntimeEventRecord[]> {
                return providerRuntimeEvents.slice(0);
            }
        },
        commandController: {
            executeVisibleCommand: async function(
                request: VisibleCommandRequest,
                snapshot: RuntimeSessionSnapshot
            ): Promise<RuntimeCommandExecutionResult> {
                return executeVisibleRCommandWithEffects(
                    request.text,
                    request.source,
                    snapshot,
                    request.outputWidth
                );
            }
        }
    };
};

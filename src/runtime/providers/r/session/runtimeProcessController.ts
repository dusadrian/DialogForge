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
    createProviderRuntimeEvent,
    createTranscriptEventsFromRuntimeControl
} from "../protocol/runtimeControlEvents";
import {
    createRVisibleCommandExecutor
} from "../controllers/rVisibleCommandExecutor";
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
    let pendingVisibleCommandClear: NodeJS.Immediate | null = null;

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

    const streamRuntimeProcessOutput = function(output: {
        streamName: "stdout" | "stderr";
        text: string;
    }): void {
        if (
            !activeVisibleCommand
            || !options.onTranscriptEvents
            || !output.text
        ) {
            return;
        }

        options.onTranscriptEvents([
            createTranscriptEvent(
                "output",
                activeVisibleCommand.request,
                {
                    id: createRequestId("process-stream"),
                    parentId: activeVisibleCommand.parentId,
                    streamName: output.streamName,
                    message: output.text
                }
            )
        ]);
    };

    const visibleCommandController = createRVisibleCommandExecutor({
        getClient: function() {
            return client;
        },
        createRequestId,
        onRuntimeControlEvents: recordRuntimeControlEvents,
        onExecutionStarted: function(request, parentId) {
            if (pendingVisibleCommandClear) {
                clearImmediate(pendingVisibleCommandClear);
                pendingVisibleCommandClear = null;
            }

            activeVisibleCommand = { request, parentId };
        },
        onExecutionFinished: function() {
            const completedCommand = activeVisibleCommand;

            pendingVisibleCommandClear = setImmediate(() => {
                pendingVisibleCommandClear = null;

                if (activeVisibleCommand === completedCommand) {
                    activeVisibleCommand = null;
                }
            });
        }
    });
    const executeVisibleRCommandWithEffects = function(
        commandText: string,
        source: string,
        snapshot: RuntimeSessionSnapshot,
        outputWidth?: number
    ) {
        return visibleCommandController.executeVisibleCommand(
            createVisibleCommandRequest({
                text: commandText,
                source,
                outputWidth
            }),
            snapshot
        );
    };

    const processHost = createRRuntimeProcessHost({
        createLaunchPlan: options.createLaunchPlan,
        startupTimeoutMs,
        onClientChanged: (nextClient) => {
            client = nextClient;
        },
        onRuntimeEvent: streamRuntimeControlEvent,
        onProcessOutput: streamRuntimeProcessOutput,
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
                return visibleCommandController.executeVisibleCommand(
                    request,
                    snapshot
                );
            }
        }
    };
};

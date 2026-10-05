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
    VisibleCommandRequest
} from "../../../provider-contract/runtimeProvider";
import {
    createRuntimeControlClient
} from "../protocol/runtimeControlClient";
import {
    createLiveTranscriptEventsFromRuntimeControl
} from "../protocol/runtimeControlEvents";
import {
    createRVisibleCommandExecutor
} from "../controllers/rVisibleCommandExecutor";
import { createRRuntimeProcessHost } from "./runtimeProcessHost";
import {
    createRRuntimeControllerSet
} from "../controllers/rRuntimeControllerSet";
import {
    createRRuntimeEventController
} from "../controllers/rRuntimeEventController";
import type { RRuntimeLaunchPlan } from "./runtimeLaunchPlan";
import { prepareNativeOrderedOutput } from "./runtimeOrderedOutputExecutionPrototype";


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


export const createRRuntimeProcessController = function(
    options: RRuntimeProcessControllerOptions
): RRuntimeProcessController {
    let client: ReturnType<typeof createRuntimeControlClient> | null = null;
    let orderedOutputContext: { directory: string; sessionId: string } | null = null;
    let processOutputSequence = 0;
    let processOutputOwner = createRequestId("runtime-process-output");
    const orderedCaptures = new Set<ReturnType<typeof prepareNativeOrderedOutput>>();
    const startupTimeoutMs = options.startupTimeoutMs ?? 7000;
    const runtimeEvents = createRRuntimeEventController();
    let activeVisibleCommand: {
        request: VisibleCommandRequest;
        parentId: string;
    } | null = null;

    const streamRuntimeControlEvent = function(event: unknown): void {
        if (!activeVisibleCommand || !options.onTranscriptEvents) {
            return;
        }

        const events = createLiveTranscriptEventsFromRuntimeControl(
            event,
            activeVisibleCommand.request,
            activeVisibleCommand.parentId,
            Boolean(orderedOutputContext)
        );

        if (events.length > 0) {
            options.onTranscriptEvents(events);
        }
    };

    const streamRuntimeProcessOutput = function(output: {
        streamName: "stdout" | "stderr";
        text: string;
    }): void {
        if (!client || !options.onTranscriptEvents || !output.text) {
            return;
        }
        // OS pipes have no command identity, regardless of R capture mode.
        // Typed R output retains its shared reader/receipt path; these bytes
        // use the SAME transcript constructor as both runtime compositions.
        const id = `process-output:${JSON.stringify([
            orderedOutputContext?.sessionId || processOutputOwner, ++processOutputSequence
        ])}`;
        options.onTranscriptEvents([
            createTranscriptEvent("output", {
                kind: "runtime.process", source: "runtime.process", text: ""
            }, {
                id, parentId: id,
                streamName: output.streamName,
                message: output.text
            })
        ]);
    };

    const visibleCommandController = createRVisibleCommandExecutor({
        onTranscriptEvents: options.onTranscriptEvents,
        prepareOutputCapture: function(request, parentId, ownerClient) {
            if (!orderedOutputContext) {
                return null;
            }
            const capture = prepareNativeOrderedOutput({
                ...orderedOutputContext, request, parentId,
                isCurrent: () => client === ownerClient,
                onTranscriptEvents: options.onTranscriptEvents
            });
            orderedCaptures.add(capture);
            return {
                ...capture,
                retire: async () => {
                    orderedCaptures.delete(capture);
                    await capture.retire();
                }
            };
        },
        getClient: function() {
            return client;
        },
        createRequestId,
        onRuntimeControlEvents: runtimeEvents.recordRuntimeControlEvents,
        onExecutionStarted: function(request, parentId) {
            activeVisibleCommand = { request, parentId };
        },
        onExecutionFinished: function(parentId) {
            if (activeVisibleCommand?.parentId !== parentId) {
                return;
            }
            activeVisibleCommand = null;
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
        onClientChanged: (nextClient, context) => {
            if (client !== nextClient) {
                for (const capture of orderedCaptures) {
                    void capture.retire();
                }
                orderedCaptures.clear();
                orderedOutputContext = null;
                processOutputSequence = 0;
                processOutputOwner = createRequestId("runtime-process-output");
                activeVisibleCommand = null;
            }
            client = nextClient;
            if (context?.plan.env.DM_ORDERED_OUTPUT_ENABLED === "1") {
                if (
                    context.meta.orderedOutputEncoding !== "utf8"
                    || context.meta.orderedOutputSession !== context.plan.env.DM_ORDERED_OUTPUT_SESSION
                ) {
                    throw new Error("Native ordered output startup did not confirm encoding and ownership.");
                }
                orderedOutputContext = {
                    directory: context.plan.env.DM_ORDERED_OUTPUT_DIR,
                    sessionId: context.meta.orderedOutputSession
                };
            }
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
        interrupt: processHost.interrupt
    });

    return {
        lifecycleController: {
            start: processHost.start,
            stop: processHost.stop
        },
        ...runtimeControllers,
        eventController: runtimeEvents,
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

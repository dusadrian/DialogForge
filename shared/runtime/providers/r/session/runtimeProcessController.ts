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
import { rString } from "../commands/rLiteral";
import { createRRuntimeProcessHost } from "./runtimeProcessHost";
import { createRWorkspaceController } from "../controllers/rWorkspaceController";
import { createRQueryController } from "../controllers/rQueryController";
import { createRImportController } from "../controllers/rImportController";
import { createRProductCommandController } from "../controllers/rProductCommandController";
import { createRExtensionController } from "../controllers/rExtensionController";
import { createRToolController } from "../controllers/rToolController";
import { createRTabularMetadataController } from "../controllers/rTabularMetadataController";
import { createRTabularMutationController } from "../controllers/rTabularMutationController";
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

            if (runtimeEvent) {
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

    const executeVisibleRCommand = async function(
        commandText: string,
        source: string,
        snapshot: RuntimeSessionSnapshot
    ): Promise<TranscriptEvent[]> {
        const request = createVisibleCommandRequest({
            text: commandText,
            source
        });

        if (isCommentOnlyRInput(request.text)) {
            return [
                createTranscriptEvent("submitted", request),
                createTranscriptEvent("completed", request, {
                    state: "idle"
                })
            ];
        }

        if (!client) {
            return [
                createTranscriptEvent("rejected", request, {
                    message: "R runtime-control session is not attached."
                })
            ];
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
                timeoutMs: 10000
            }
        }).finally(() => {
            activeVisibleCommand = null;
        });

        recordRuntimeControlEvents(result.events, snapshot);

        const liveTranscript = createTranscriptEventsFromRuntimeControl(result.events, request, parentId);

        if (result.ok && liveTranscript.length > 0) {
            return liveTranscript;
        }

        return [
            createTranscriptEvent("submitted", request),
            createTranscriptEvent("output", request, {
                message: String(result.error || "R command execution failed.")
            }),
            createTranscriptEvent("failed", request, {
                message: String(result.error || "R command execution failed.")
            })
        ];
    };

    const checkPackageVersion = async function(packageName: string): Promise<string> {
        if (!client) {
            return "";
        }

        const result = await client.execute({
            id: createRequestId("package-status"),
            method: "evaluate_code",
            params: {
                code: `cat(if (requireNamespace(${rString(packageName)}, quietly = TRUE)) as.character(utils::packageVersion(${rString(packageName)})) else "")`,
                mode: "silent",
                timeoutMs: 5000
            }
        });

        return result.ok ? String(result.result || "").trim() : "";
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

    const workspaceController = createRWorkspaceController({
        getClient: () => client,
        createRequestId
    });
    const queryController = createRQueryController({
        getClient: () => client,
        createRequestId
    });
    const importController = createRImportController({
        getClient: () => client,
        createRequestId,
        executeVisibleCommand: executeVisibleRCommand,
        transcriptHasFailure
    });
    const productCommandController = createRProductCommandController({
        getClient: () => client,
        checkPackageVersion
    });
    const extensionController = createRExtensionController({
        getClient: () => client,
        createRequestId,
        interrupt: processHost.interrupt
    });
    const toolController = createRToolController({
        getClient: () => client,
        createRequestId,
        checkPackageVersion
    });
    const tabularMetadataController = createRTabularMetadataController({
        getClient: () => client,
        createRequestId,
        executeVisibleCommand: executeVisibleRCommand,
        transcriptHasFailure
    });
    const tabularMutationController = createRTabularMutationController({
        getClient: () => client,
        createRequestId,
        executeVisibleCommand: executeVisibleRCommand,
        transcriptHasFailure
    });

    return {
        lifecycleController: {
            start: processHost.start,
            stop: processHost.stop
        },
        workspaceController,
        tabularController: {
            ...tabularMetadataController,
            ...tabularMutationController
        },
        queryController,
        productCommandController,
        extensionController,
        importController,
        toolController,
        eventController: {
            listRuntimeEvents: async function(): Promise<RuntimeEventRecord[]> {
                return providerRuntimeEvents.slice(0);
            }
        },
        commandController: {
            executeVisibleCommand: async function(
                request: VisibleCommandRequest,
                snapshot: RuntimeSessionSnapshot
            ): Promise<TranscriptEvent[]> {
                return executeVisibleRCommand(request.text, request.source, snapshot);
            }
        }
    };
};

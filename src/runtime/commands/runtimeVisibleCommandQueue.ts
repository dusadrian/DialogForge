import type {
    RuntimeCommandExecutionResult,
    VisibleCommandRequest
} from "../provider-contract/runtimeProvider";
import { createTranscriptEvent } from "./commandProtocol";


interface QueuedVisibleCommand {
    request: VisibleCommandRequest;
    resolve(result: RuntimeCommandExecutionResult): void;
    reject(error: unknown): void;
}


export const createRuntimeVisibleCommandQueue = function(
    execute: (request: VisibleCommandRequest) => Promise<RuntimeCommandExecutionResult>
) {
    const queued: QueuedVisibleCommand[] = [];
    let active: QueuedVisibleCommand | null = null;

    const dispatchNext = function(): void {
        if (active || queued.length === 0) {
            return;
        }

        const command = queued.shift()!;
        active = command;

        // Keep ownership through the complete provider/effects promise. An
        // evaluated event alone is not an output-drain acknowledgement.
        void execute(command.request).then(command.resolve, command.reject)
            .finally(() => {
                if (active === command) {
                    active = null;
                    dispatchNext();
                }
            });
    };

    return {
        enqueue: function(request: VisibleCommandRequest): Promise<RuntimeCommandExecutionResult> {
            return new Promise((resolve, reject) => {
                queued.push({ request, resolve, reject });
                dispatchNext();
            });
        },
        retire: function(): void {
            // The provider lifecycle owns terminating the running operation.
            // Detach its queue ownership so it cannot hold a replacement session.
            active = null;

            for (const command of queued.splice(0)) {
                command.resolve({
                    executionDisposition: "not_started",
                    transcriptEvents: [createTranscriptEvent("rejected", command.request, {
                        message: "The runtime session changed before this command started."
                    })],
                    workspaceUpdate: null,
                    workspaceReconciliation: "not_checked"
                });
            }
        }
    };
};

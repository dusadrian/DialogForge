import type {
    ProductCommandRequest,
    ProductCommandResult,
    RuntimeSessionSnapshot,
    TranscriptEvent,
    VisibleCommandRequest
} from "../provider-contract/runtimeProvider";
import {
    createTranscriptEvent
} from "./commandProtocol";
import type {
    RuntimeCommandExecutionController
} from "./runtimeCommandExecutionController";
import {
    createProductCommandResult
} from "../product-commands/productCommandProtocol";


export interface RuntimeCommandOperationControllerOptions {
    commandExecutionController: RuntimeCommandExecutionController;
    getSnapshot(): RuntimeSessionSnapshot;
    recordRuntimeEvent(
        type: string,
        objectName: string,
        detail: string,
        payload: Record<string, unknown>
    ): void;
}


export interface RuntimeCommandOperationController {
    executeVisibleCommand(request: VisibleCommandRequest): Promise<TranscriptEvent[]>;
    executeProductCommand(request: ProductCommandRequest): Promise<ProductCommandResult>;
}


export const createRuntimeCommandOperationController = function(
    options: RuntimeCommandOperationControllerOptions
): RuntimeCommandOperationController {
    return {
        executeVisibleCommand: async function(request): Promise<TranscriptEvent[]> {
            const snapshot = options.getSnapshot();

            if (snapshot.status !== "ready") {
                return [
                    createTranscriptEvent(
                        "rejected",
                        request,
                        {
                            message: "Runtime session is not ready."
                        }
                    )
                ];
            }

            return options.commandExecutionController.executeVisibleCommand(request);
        },
        executeProductCommand: async function(request): Promise<ProductCommandResult> {
            const snapshot = options.getSnapshot();
            const transcriptRequest = {
                kind: "product.command",
                source: request.source,
                text: request.command
            };

            if (snapshot.status !== "ready") {
                return createProductCommandResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    productId: request.productId,
                    command: request.command,
                    transcriptEvents: [
                        createTranscriptEvent(
                            "rejected",
                            transcriptRequest,
                            {
                                message: "Runtime session is not ready."
                            }
                        )
                    ],
                    message: "Runtime session is not ready."
                });
            }

            options.recordRuntimeEvent(
                "product.command.executed",
                request.productId,
                request.command,
                {
                    productId: request.productId,
                    command: request.command,
                    capability: request.capability,
                    rPackages: request.rPackages
                }
            );

            return options.commandExecutionController.executeProductCommand(request);
        }
    };
};

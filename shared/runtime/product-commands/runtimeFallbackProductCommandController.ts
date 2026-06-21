import { createTranscriptEvent } from "../commands/commandProtocol";
import { createDependencyCheckRequest } from "../dependencies/dependencyProtocol";
import type {
    DependencyCheckResult,
    ProductCommandRequest,
    ProductCommandResult,
    RuntimeProductCommandController
} from "../provider-contract/runtimeProvider";
import { createProductCommandResult } from "./productCommandProtocol";


export interface RuntimeFallbackProductCommandControllerOptions {
    hasDependencyCapability(): boolean;
    checkDependencies(
        request: ReturnType<typeof createDependencyCheckRequest>
    ): Promise<DependencyCheckResult>;
}


const createTranscriptRequest = function(request: ProductCommandRequest) {
    return {
        kind: "product.command",
        source: request.source,
        text: request.command
    };
};


export const createRuntimeFallbackProductCommandController = function(
    options: RuntimeFallbackProductCommandControllerOptions
): RuntimeProductCommandController {
    return {
        executeProductCommand: async function(request, snapshot): Promise<ProductCommandResult> {
            const transcriptRequest = createTranscriptRequest(request);

            if (
                request.rPackages.length > 0 &&
                options.hasDependencyCapability()
            ) {
                const dependencyResult = await options.checkDependencies(
                    createDependencyCheckRequest({
                        kind: "package",
                        names: request.rPackages,
                        source: request.source || "product-command"
                    })
                );
                const available = dependencyResult.items.filter((item) => {
                    return item.status === "available";
                }).map((item) => {
                    return item.version
                        ? item.name + " " + item.version
                        : item.name;
                });
                const missing = dependencyResult.items.filter((item) => {
                    return item.status !== "available";
                }).map((item) => {
                    return item.name;
                });
                const lines = [
                    available.length
                        ? "available: " + available.join(", ")
                        : "",
                    missing.length
                        ? "missing: " + missing.join(", ")
                        : "",
                    missing.length
                        ? "Placeholder dependency check cannot install packages without a provider command controller."
                        : ""
                ].filter((line) => {
                    return line.length > 0;
                });

                return createProductCommandResult({
                    status: missing.length > 0 ? "partial" : "ready",
                    providerId: snapshot.providerId,
                    productId: request.productId,
                    command: request.command,
                    transcriptEvents: [
                        createTranscriptEvent("submitted", transcriptRequest),
                        createTranscriptEvent("output", transcriptRequest, {
                            message: lines.join("\n")
                        }),
                        createTranscriptEvent("completed", transcriptRequest)
                    ],
                    message: missing.length > 0
                        ? "Placeholder product command found missing package(s): " +
                            missing.join(", ") + "."
                        : "Placeholder product command found all requested packages available."
                });
            }

            return createProductCommandResult({
                status: "planned",
                providerId: snapshot.providerId,
                productId: request.productId,
                command: request.command,
                transcriptEvents: [
                    createTranscriptEvent("submitted", transcriptRequest),
                    createTranscriptEvent(
                        "output",
                        transcriptRequest,
                        {
                            message: "Placeholder runtime accepted product command " +
                                request.command + "."
                        }
                    ),
                    createTranscriptEvent("completed", transcriptRequest)
                ],
                message: "Product command was routed through the runtime boundary as a placeholder."
            });
        }
    };
};

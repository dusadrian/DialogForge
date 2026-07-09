import { createTranscriptEvent } from "../../../commands/commandProtocol";
import { createProductCommandResult } from "../../../product-commands/productCommandProtocol";
import type {
    RuntimeProductCommandController
} from "../../../provider-contract/runtimeProvider";
import {
    createRequiredInstallCommand,
    createRUniverseInstallCommand,
    normalizePackageNames,
    selectRUniversePackages
} from "../dependencies/packageInstallPlan";
import { createRuntimeControlClient } from "../protocol/runtimeControlClient";


type RuntimeControlClient = ReturnType<typeof createRuntimeControlClient>;


export interface RProductCommandControllerOptions {
    getClient(): RuntimeControlClient | null;
    checkPackageVersion(packageName: string): Promise<string>;
}


export const createRProductCommandController = function(
    options: RProductCommandControllerOptions
): RuntimeProductCommandController {
    return {
        executeProductCommand: async function(request, snapshot) {
            const transcriptRequest = {
                kind: "product.command",
                source: request.source,
                text: request.command
            };

            if (!options.getClient()) {
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
                                message: "R runtime-control session is not attached."
                            }
                        )
                    ],
                    message: "R runtime-control session is not attached."
                });
            }

            const packageNames = normalizePackageNames(request.rPackages);
            const commandName = String(request.command || "").toLowerCase();
            const updatePackages = selectRUniversePackages(packageNames);

            if (commandName.endsWith(".packages.updaterequired")) {
                const updateCommand = createRUniverseInstallCommand(
                    updatePackages
                );
                const lines = [
                    updatePackages.length
                        ? `development packages: ${updatePackages.join(", ")}`
                        : "No development-version packages are required for this product command.",
                    updateCommand
                        ? `update command: ${updateCommand}`
                        : ""
                ].filter((line) => {
                    return line.length > 0;
                });

                return createProductCommandResult({
                    status: updatePackages.length > 0
                        ? "ready"
                        : "unsupported",
                    providerId: snapshot.providerId,
                    productId: request.productId,
                    command: request.command,
                    transcriptEvents: [
                        createTranscriptEvent(
                            "submitted",
                            transcriptRequest
                        ),
                        createTranscriptEvent(
                            "output",
                            transcriptRequest,
                            { message: lines.join("\n") }
                        ),
                        createTranscriptEvent(
                            "completed",
                            transcriptRequest
                        )
                    ],
                    message: updatePackages.length > 0
                        ? `R runtime-control prepared a development-version update command for ${updatePackages.join(", ")}.`
                        : "No development-version packages are required for this product command."
                });
            }

            const versions: Record<string, string> = {};

            for (const packageName of packageNames) {
                versions[packageName] = await options.checkPackageVersion(
                    packageName
                );
            }

            const missing = packageNames.filter((packageName) => {
                return !versions[packageName];
            });
            const available = packageNames.filter((packageName) => {
                return Boolean(versions[packageName]);
            });
            const installCommand = createRequiredInstallCommand(
                missing
            );
            const lines = [
                available.length
                    ? `available: ${available.map((name) => {
                        return `${name} ${versions[name]}`;
                    }).join(", ")}`
                    : "",
                missing.length
                    ? `missing: ${missing.join(", ")}`
                    : "",
                installCommand
                    ? `install command: ${installCommand}`
                    : "",
                !installCommand
                    ? "All requested packages are available."
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
                    createTranscriptEvent(
                        "output",
                        transcriptRequest,
                        { message: lines.join("\n") }
                    ),
                    createTranscriptEvent("completed", transcriptRequest)
                ],
                message: missing.length > 0
                    ? `R runtime-control found missing package(s): ${missing.join(", ")} and prepared an install command.`
                    : "R runtime-control found all product packages available."
            });
        }
    };
};

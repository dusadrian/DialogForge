import type {
    IpcMain
} from "electron";
import type {
    ProductDialogDefinition
} from "../../dialog-runtime/dialog-builder/productDialogDefinition";

import type {
    RuntimeSessionManager,
    TranscriptEvent,
    VisibleCommandRequest
} from "../../runtime/provider-contract/runtimeProvider";
import {
    createVisibleCommandRequest
} from "../../runtime/commands/commandProtocol";
import {
    createRuntimeCommandReceipt,
    type RuntimeCommandReceipt
} from "../../runtime/commands/runtimeCommandReceipt";
import { createRuntimeVisibleCommandDelivery } from "../../runtime/commands/runtimeVisibleCommandDelivery";
import {
    loadRequiredRPackages,
    requireSuccessfulRPackageAttachment
} from "../../runtime/providers/r/dependencies/rPackageAttachment";
import {
    createRDialogCommandPackageRequirements
} from "../../runtime/providers/r/dependencies/runtimePackageRequirements";
import {
    createInvisibleQueryRequest
} from "../../runtime/queries/invisibleQueryProtocol";
import type {
    ImportPreviewRequest
} from "../../runtime/tabular-data/importPreview";
import {
    createProductDialogRuntimeIpcController
} from "./productDialogRuntimeIpcController";
import {
    applyRPackageRequirementConstraints
} from "../../runtime/providers/r/dependencies/rPackageCompatibility";
import {
    createRPackagePreparationController,
    createRPackageRuntimeStartupReceipt,
    prepareRequiredRPackages
} from "../../runtime/providers/r/dependencies/rPackageRequirementReadiness";
import {
    captureRPackageRuntime,
    requireCurrentRPackageRuntime
} from "../../runtime/providers/r/dependencies/rPackageRuntimeGuard";


export interface ProductDialogRuntimeCompositionOptions {
    ipcMain: IpcMain;
    runtimeSessionManager: RuntimeSessionManager;
    productId: string;
    packageRequirements?: unknown;
    openImportFile(): Promise<unknown>;
    previewImportFile(
        input: Partial<ImportPreviewRequest>
    ): Promise<unknown>;
    getUiCommandVisibility(): "hidden" | "visible";
    executeVisibleCommandReceiptAndBroadcast(
        request: VisibleCommandRequest
    ): Promise<RuntimeCommandReceipt>;
    sendTranscriptEvents(events: TranscriptEvent[]): void;
    invalidateDatasetPreview(): void;
    refreshWorkspaceAndBroadcast(): Promise<unknown>;
    broadcastRuntimeEvents(): Promise<void>;
    reportError(error: unknown): void;
}


export interface ProductDialogRuntimeComposition {
    prepareDialog(
        dialogId: string,
        dialog: ProductDialogDefinition
    ): Promise<{ ok: boolean; error: string; status?: string }>;
}


export const registerProductDialogRuntimeComposition = function(
    options: ProductDialogRuntimeCompositionOptions
): ProductDialogRuntimeComposition {
    const packagePreparation = createRPackagePreparationController<{
        ok: boolean;
        error: string;
        status?: string;
    }>({
        getRuntime: () => options.runtimeSessionManager,
        ensureRuntime: async function() {
            const session = await options.runtimeSessionManager.start();
            if (session.status !== "ready") {
                throw new Error(session.message || "R runtime is not ready.");
            }
            return createRPackageRuntimeStartupReceipt(options.runtimeSessionManager);
        }
    });
    // Hidden dialog commands keep their existing full refresh without publishing
    // a transcript. The same delivery owner still guards that refresh/lifetime.
    const deliverHiddenCommand = createRuntimeVisibleCommandDelivery({
        runtime: options.runtimeSessionManager,
        publishTranscript: function() {},
        publishWorkspace: async function() {},
        refreshWorkspaceAfterCommand: async function() {
            options.invalidateDatasetPreview();
            await options.refreshWorkspaceAndBroadcast();
        },
        refreshRuntimeEvents: async function() {
            void options.broadcastRuntimeEvents().catch(options.reportError);
        },
        reportRuntimeEventError: options.reportError
    });
    const executeUiActionCommand = async function(
        request: VisibleCommandRequest,
        visibility: "hidden" | "visible" =
            options.getUiCommandVisibility()
    ): Promise<RuntimeCommandReceipt> {
        if (visibility === "visible") {
            return options.executeVisibleCommandReceiptAndBroadcast(request);
        }

        const { accepted, result } = await deliverHiddenCommand(request);
        return createRuntimeCommandReceipt(result, accepted);
    };

    const ensureDependencies = async function(
        value: unknown,
        packageRequirementsInput: unknown,
        source: string
    ): Promise<{ ok: boolean; error: string; status?: string }> {
        const requirements = applyRPackageRequirementConstraints(
            createRDialogCommandPackageRequirements(value, packageRequirementsInput),
            options.packageRequirements || []
        );

        if (requirements.length === 0) {
            return {
                ok: true,
                error: ""
            };
        }

        return packagePreparation.prepare(requirements, async function(): Promise<{
            ok: boolean;
            error: string;
            status?: string;
        }> {
            const isCurrent = captureRPackageRuntime(() => options.runtimeSessionManager);
            return prepareRequiredRPackages(requirements, {
                isCurrent,
                readVersions: async function(query) {
                    const result = await options.runtimeSessionManager
                        .executeInvisibleQuery(createInvisibleQueryRequest({
                            query,
                            source: `${source}.package-versions`
                        }));

                    return {
                        ok: result.status === "ready",
                        value: result.value,
                        error: result.message
                    };
                },
                loadPackages: async function(packageNames) {
                    try {
                        await loadRequiredRPackages(packageNames, {
                            isCurrent,
                            readStatus: async function(query) {
                                const result = await options.runtimeSessionManager
                                    .executeInvisibleQuery(createInvisibleQueryRequest({
                                        query,
                                        source: `${source}.dependencies`
                                    }));

                                if (result.status !== "ready") {
                                    throw new Error(result.message
                                        || "Failed to inspect required R package attachment.");
                                }

                                return result.value;
                            },
                            packagesLoaded: async function() {
                                options.invalidateDatasetPreview();
                                await options.refreshWorkspaceAndBroadcast();
                                void options.broadcastRuntimeEvents().catch(options.reportError);
                            },
                            attach: async function(packageName, command) {
                                const result = await options.runtimeSessionManager
                                    .executeVisibleCommandWithEffects(createVisibleCommandRequest({
                                        text: command,
                                        source: `${source}.dependencies`
                                    }));
                                requireCurrentRPackageRuntime(isCurrent);
                                options.sendTranscriptEvents(result.transcriptEvents);
                                requireSuccessfulRPackageAttachment(
                                    packageName, createRuntimeCommandReceipt(result), isCurrent
                                );
                            }
                        });
                        requireCurrentRPackageRuntime(isCurrent);
                    }
                    catch (error) {
                        return {
                            ok: false,
                            error: error instanceof Error ? error.message : String(error)
                        };
                    }

                    return {
                        ok: true,
                        error: ""
                    };
                }
            });
        }).catch((error) => ({
            ok: false,
            error: error instanceof Error ? error.message : String(error)
        }));
    };

    createProductDialogRuntimeIpcController({
        ipcMain: options.ipcMain,
        runtimeSessionManager: options.runtimeSessionManager,
        getProductId: function(): string {
            return options.productId;
        },
        openImportFile: options.openImportFile,
        previewImportFile: options.previewImportFile,
        ensureDependencies,
        executeVisibleCommand: executeUiActionCommand,
        broadcastRuntimeEvents: options.broadcastRuntimeEvents,
        reportError: options.reportError
    });

    return {
        prepareDialog: async function(dialogId, dialog) {
            const properties = dialog.properties
                && typeof dialog.properties === "object"
                ? dialog.properties
                : {};

            return ensureDependencies(
                properties.dependencies,
                properties.rPackageRequirements,
                `${options.productId}.dialog.${dialogId}.open`
            );
        }
    };
};

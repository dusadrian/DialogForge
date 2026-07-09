import type {
    IpcMain
} from "electron";

import type {
    RuntimeSessionManager,
    TranscriptEvent,
    VisibleCommandRequest
} from "../../runtime/provider-contract/runtimeProvider";
import {
    createVisibleCommandRequest
} from "../../runtime/commands/commandProtocol";
import {
    createInvisibleQueryRequest
} from "../../runtime/queries/invisibleQueryProtocol";
import {
    createProductDialogRuntimeIpcController
} from "./productDialogRuntimeIpcController";


export interface ProductDialogRuntimeCompositionOptions {
    ipcMain: IpcMain;
    runtimeSessionManager: RuntimeSessionManager;
    productId: string;
    getUiCommandVisibility(): "hidden" | "visible";
    executeVisibleCommandAndBroadcast(
        request: VisibleCommandRequest
    ): Promise<TranscriptEvent[]>;
    sendTranscriptEvents(events: TranscriptEvent[]): void;
    invalidateDatasetPreview(): void;
    refreshWorkspaceAndBroadcast(): Promise<unknown>;
    broadcastRuntimeEvents(): Promise<void>;
    reportError(error: unknown): void;
}


export const registerProductDialogRuntimeComposition = function(
    options: ProductDialogRuntimeCompositionOptions
): void {
    const dependencyReadiness = new Map<
        string,
        Promise<{ ok: boolean; error: string }>
    >();
    const executeUiActionCommand = async function(
        request: VisibleCommandRequest,
        visibility: "hidden" | "visible" =
            options.getUiCommandVisibility()
    ): Promise<TranscriptEvent[]> {
        if (visibility === "visible") {
            return options.executeVisibleCommandAndBroadcast(request);
        }

        const events = await options.runtimeSessionManager
            .executeVisibleCommand(request);

        options.invalidateDatasetPreview();
        await options.refreshWorkspaceAndBroadcast();
        void options.broadcastRuntimeEvents().catch(options.reportError);

        return events;
    };

    const normalizeDependencies = function(value: unknown): string[] {
        const source = Array.isArray(value)
            ? value
            : String(value || "").split(/[;,\n]/);

        return Array.from(new Set(source.map((item) => {
            return String(item || "").trim();
        }).filter(Boolean)));
    };

    const isRuntimeTrue = function(value: unknown): boolean {
        if (value === true) {
            return true;
        }

        if (Array.isArray(value) && value.length === 1) {
            return isRuntimeTrue(value[0]);
        }

        return /^(?:\[1\]\s*)?true$/i.test(
            String(value || "").trim()
        );
    };

    const ensureDependencies = async function(
        value: unknown,
        source: string
    ): Promise<{ ok: boolean; error: string }> {
        const dependencies = normalizeDependencies(value);

        if (dependencies.length === 0) {
            return {
                ok: true,
                error: ""
            };
        }

        const dependencyKey = dependencies.slice().sort().join("\n");
        const existing = dependencyReadiness.get(dependencyKey);

        if (existing) {
            return existing;
        }

        const readiness = (async function(): Promise<{
            ok: boolean;
            error: string;
        }> {
            let loadedPackage = false;

            for (const packageName of dependencies) {
                const attached = await options.runtimeSessionManager
                    .executeInvisibleQuery(createInvisibleQueryRequest({
                        query: `${JSON.stringify(`package:${packageName}`)} %in% search()`,
                        source: `${source}.dependencies`
                    }));

                if (attached.status !== "ready") {
                    return {
                        ok: false,
                        error: attached.message
                            || `Failed to inspect required package ${packageName}.`
                    };
                }

                if (isRuntimeTrue(attached.value)) {
                    continue;
                }

                const events = await options.runtimeSessionManager
                    .executeVisibleCommand(createVisibleCommandRequest({
                        text: `library(${packageName})`,
                        source: `${source}.dependencies`
                    }));
                const failure = events.find((event) => {
                    return event.type === "failed"
                        || event.type === "rejected";
                });

                options.sendTranscriptEvents(events);

                if (failure) {
                    return {
                        ok: false,
                        error: String(
                            failure.message
                            || `Failed to load required package ${packageName}.`
                        )
                    };
                }

                loadedPackage = true;
            }

            if (loadedPackage) {
                options.invalidateDatasetPreview();
                await options.refreshWorkspaceAndBroadcast();
                void options.broadcastRuntimeEvents().catch(
                    options.reportError
                );
            }

            return {
                ok: true,
                error: ""
            };
        })();

        dependencyReadiness.set(dependencyKey, readiness);

        try {
            return await readiness;
        }
        finally {
            if (dependencyReadiness.get(dependencyKey) === readiness) {
                dependencyReadiness.delete(dependencyKey);
            }
        }
    };

    createProductDialogRuntimeIpcController({
        ipcMain: options.ipcMain,
        runtimeSessionManager: options.runtimeSessionManager,
        getProductId: function(): string {
            return options.productId;
        },
        ensureDependencies,
        executeVisibleCommand: executeUiActionCommand,
        broadcastRuntimeEvents: options.broadcastRuntimeEvents,
        reportError: options.reportError
    });
};

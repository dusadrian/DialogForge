import type {
    IpcMain
} from "electron";

import type {
    RuntimeSessionManager,
    TranscriptEvent,
    VisibleCommandRequest
} from "../../runtime/provider-contract/runtimeProvider";
import {
    createDependencyCheckRequest
} from "../../runtime/dependencies/dependencyProtocol";
import {
    createVisibleCommandRequest
} from "../../runtime/commands/commandProtocol";
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
    invalidateDatasetPreview(): void;
    refreshWorkspaceAndBroadcast(): Promise<unknown>;
    broadcastRuntimeEvents(): Promise<void>;
    reportError(error: unknown): void;
}


export const registerProductDialogRuntimeComposition = function(
    options: ProductDialogRuntimeCompositionOptions
): void {
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
            : String(value || "").split(",");

        return Array.from(new Set(source.map((item) => {
            return String(item || "").trim();
        }).filter(Boolean)));
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

        const result = await options.runtimeSessionManager.checkDependencies(
            createDependencyCheckRequest({
                kind: "package",
                names: dependencies,
                source
            })
        );
        const missing = result.items.filter((item) => {
            return item.status !== "available";
        }).map((item) => {
            return item.name;
        });

        if (missing.length > 0) {
            return {
                ok: false,
                error: `Required package(s) not installed: ${missing.join(", ")}`
            };
        }

        for (const packageName of dependencies) {
            const events = await executeUiActionCommand(
                createVisibleCommandRequest({
                    text: `library(${packageName})`,
                    source: `${source}.dependency`
                }),
                "hidden"
            );
            const failed = events.some((event) => {
                return event.type === "error" || event.type === "rejected";
            });

            if (failed) {
                return {
                    ok: false,
                    error: `Failed to load required package: ${packageName}`
                };
            }
        }

        return {
            ok: true,
            error: ""
        };
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

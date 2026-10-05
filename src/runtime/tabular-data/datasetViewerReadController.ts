import type {
    RuntimeSessionManager,
    TabularPreviewRequest,
    TabularPreviewSnapshot
} from "../provider-contract/runtimeProvider";
import { createRuntimeExtensionMethodRequest } from "../extensions/runtimeExtensionProtocol";
import { canFallbackVariableMetadataBatch } from "./datasetVariableMetadataBatch";
import { readRuntimeDatasetFilterMask } from "./runtimeDatasetFilterMask";
import { toDatasetViewerContent, toDatasetViewerSchema } from "./datasetViewerReadProjection";
import { captureWorkspaceRuntimeScope } from "../workspace/workspaceSnapshotDelivery";
import {
    initialDatasetPreviewRowCount,
    initialDatasetPreviewColumnCount
} from "../../dataset-editor/datasetEditorReadPolicy";


export interface DatasetViewerReadControllerOptions {
    runtimeSessionManager: Pick<RuntimeSessionManager,
        "readTabularSchema" | "readVariableMetadata" | "executeRuntimeMethod"
        | "getSnapshot" | "getWorkspaceSnapshot">;
    isCurrentRuntime?(): boolean;
    readTabularPreview(request: TabularPreviewRequest): Promise<TabularPreviewSnapshot>;
    readFilterState(name: string): { command?: string } | null | undefined;
    readVariableMetadataBatch?(name: string, start: number, count: number): Promise<unknown>;
}


const recordInput = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
};


const positiveInteger = function(value: unknown, fallback: number): number {
    const number = Number(value);

    if (!Number.isFinite(number) || number < 1) {
        return fallback;
    }

    return Math.floor(number);
};


export const createDatasetViewerReadController = function(
    options: DatasetViewerReadControllerOptions
) {
    const runtime = options.runtimeSessionManager;
    const captureReadScope = function(): () => boolean {
        return captureWorkspaceRuntimeScope(() => {
            return options.isCurrentRuntime?.() === false ? null : runtime;
        });
    };

    return {
        async readSchema(value: unknown) {
            const isCurrent = captureReadScope();
            const name = String(value || "").trim();

            if (!name || !isCurrent()) {
                return null;
            }
            const snapshot = await runtime.readTabularSchema(name);

            return isCurrent() ? toDatasetViewerSchema(snapshot) : null;
        },

        async readContent(value: unknown) {
            const isCurrent = captureReadScope();
            const input = recordInput(value);
            const objectName = String(input.name || "").trim();

            if (!objectName || !isCurrent()) {
                return null;
            }

            const request: TabularPreviewRequest = {
                objectName,
                rowStart: positiveInteger(input.rowStart, 1),
                rowCount: positiveInteger(input.rowCount, initialDatasetPreviewRowCount),
                columns: Array.isArray(input.columns) ? input.columns.map(String) : [],
                columnCount: positiveInteger(input.columnCount, initialDatasetPreviewColumnCount)
            };

            const snapshot = await options.readTabularPreview(request);

            return isCurrent() ? toDatasetViewerContent(snapshot, request) : null;
        },

        async readFilterMask(value: unknown) {
            const isCurrent = captureReadScope();
            if (!isCurrent()) {
                return null;
            }
            const page = await readRuntimeDatasetFilterMask(runtime, value, {
                fallbackRows: 0,
                readFilterState: options.readFilterState
            });

            return isCurrent() ? page : null;
        },

        async readVariables(value: unknown) {
            const isCurrent = captureReadScope();
            const name = String(recordInput(value).name || "").trim();

            if (!name || !isCurrent()) {
                return null;
            }

            const snapshot = await runtime.readVariableMetadata(name);

            return isCurrent() && snapshot.status === "ready" ? snapshot.variables : null;
        },

        async readVariableBatch(value: unknown) {
            const isCurrent = captureReadScope();
            const input = recordInput(value);
            const name = String(input.name || "").trim();

            if (!name || !isCurrent()) {
                return null;
            }

            const start = positiveInteger(input.start, 1);
            const count = positiveInteger(input.count, 16);

            if (options.readVariableMetadataBatch) {
                const batch = await options.readVariableMetadataBatch(name, start, count);

                return isCurrent() ? batch : null;
            }

            const result = await runtime.executeRuntimeMethod(createRuntimeExtensionMethodRequest({
                method: "workspace.dataset_variables_batch",
                params: { name, start, count },
                source: "base-app.dataset-editor"
            }));

            if (!isCurrent()) {
                return null;
            }
            if (result.status === "ready" && result.value) {
                return result.value;
            }

            if (!canFallbackVariableMetadataBatch(result.status)) {
                return null;
            }

            const snapshot = await runtime.readVariableMetadata(name);
            if (!isCurrent()) {
                return null;
            }
            if (snapshot.status !== "ready" || !Array.isArray(snapshot.variables)) {
                return null;
            }
            const variables = snapshot.variables;
            const items = variables.slice(start - 1, start - 1 + count);

            return { name, total: variables.length, start, count: items.length, items };
        }
    };
};

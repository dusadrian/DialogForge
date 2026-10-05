import type {
    RuntimeSessionManager,
    CellUpdateResult,
    CellUpdateBatchResult,
    TabularPreviewSnapshot,
    VariableMetadataSnapshot,
    ValueLabelSnapshot,
    DeclaredMissingSnapshot,
    UiCommandVisibility
} from "../provider-contract/runtimeProvider";
import {
    createRuntimeExtensionMethodRequest
} from "../extensions/runtimeExtensionProtocol";
import { createRuntimeTabularMetadataMutation } from "./runtimeTabularMetadataMutation";
import { createRuntimeCellBatchMutation, createRuntimeCellMutation } from "./runtimeCellBatchMutation";
import { createDatasetViewerVariableMutation } from "./datasetViewerVariableMutation";
import {
    createDialogVariableValuesResult
} from "./dialogVariableValues";
import { createDatasetViewerReadController } from "./datasetViewerReadController";
import { createDatasetViewerCellMutation } from "./datasetViewerCellMutation";
import { createDatasetViewerColumnMutation } from "./datasetViewerColumnMutation";
import { createDatasetViewerRowMutation } from "./datasetViewerRowMutation";
import { createRuntimeTabularReadActions } from "./runtimeTabularReadActions";
import { createRuntimeColumnMutationActions } from "./runtimeColumnMutationActions";
import { createRuntimeRowMutationActions } from "./runtimeRowMutationActions";
import { createRuntimeTabularMetadataReads } from "./runtimeTabularMetadataReads";
import { deliverDatasetMutationTargets } from "../../dataset-editor/datasetMutationDelivery";
import {
    createDatasetMutationCacheEffect,
    type DatasetMutationCacheEffect
} from "../../dataset-editor/datasetMutationCacheEffects";


export interface RuntimeSessionDatasetChannelAdapterOptions {
    runtimeSessionManager: RuntimeSessionManager;
    isCurrentRuntime?(): boolean;
    uiCommandVisibility?(): UiCommandVisibility;
    readTabularPreview?: RuntimeSessionManager["readTabularPreview"];
    publishTabularPreview?(preview: TabularPreviewSnapshot): void;
    publishCellUpdate?(result: CellUpdateResult | CellUpdateBatchResult): void;
    publishVariableMetadata?(snapshot: VariableMetadataSnapshot): void;
    publishValueLabels?(snapshot: ValueLabelSnapshot): void;
    publishDeclaredMissing?(snapshot: DeclaredMissingSnapshot): void;
    readFilterState?(name: string): { command?: string } | null | undefined;
    readVariableMetadataBatch?(
        objectName: string,
        start: number,
        count: number
    ): Promise<unknown>;
    patchVariableMetadata?(
        objectName: string,
        variableName: string,
        value: unknown
    ): void;
    invalidateDataset(
        datasetName: string,
        effect: DatasetMutationCacheEffect,
        changes: Array<Record<string, unknown>>
    ): Promise<void> | void;
}


const recordInput = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object"
        ? value as Record<string, unknown>
        : {};
};


export const createRuntimeSessionDatasetChannelAdapter = function(
    options: RuntimeSessionDatasetChannelAdapterOptions
) {
    const runtime = options.runtimeSessionManager;
    const metadataReads = createRuntimeTabularMetadataReads({
        runtimeSessionManager: runtime,
        isCurrentRuntime: options.isCurrentRuntime,
        publishVariableMetadata: options.publishVariableMetadata,
        publishValueLabels: options.publishValueLabels,
        publishDeclaredMissing: options.publishDeclaredMissing
    });
    const tabularReads = createRuntimeTabularReadActions({
        runtimeSessionManager: runtime,
        isCurrentRuntime: options.isCurrentRuntime,
        readPreview: request => options.readTabularPreview
            ? options.readTabularPreview(request)
            : runtime.readTabularPreview(request),
        previewRead: options.publishTabularPreview
    });
    const reads = createDatasetViewerReadController({
        runtimeSessionManager: runtime,
        isCurrentRuntime: options.isCurrentRuntime,
        readTabularPreview: request => options.readTabularPreview
            ? options.readTabularPreview(request)
            : runtime.readTabularPreview(request),
        readFilterState: options.readFilterState || (() => null),
        readVariableMetadataBatch: options.readVariableMetadataBatch
    });
    const invalidate = async function(
        name: string,
        changes: Array<Record<string, unknown>>,
        variableMetadataPatched = false
    ): Promise<void> {
        await options.invalidateDataset(
            name,
            createDatasetMutationCacheEffect(changes, variableMetadataPatched),
            changes.map(change => ({ ...change, name }))
        );
    };
    const cells = createDatasetViewerCellMutation({
        runtimeSessionManager: runtime,
        isCurrentRuntime: options.isCurrentRuntime,
        uiCommandVisibility: options.uiCommandVisibility || (() => "hidden"),
        updated: (result, changes) => invalidate(result.objectName, changes)
    });
    const cellBatch = createRuntimeCellBatchMutation({
        runtimeSessionManager: runtime,
        isCurrentRuntime: options.isCurrentRuntime,
        completed: options.publishCellUpdate,
        updated: async (_result, objectNames, isCurrent) => {
            await deliverDatasetMutationTargets({
                isCurrent,
                objectNames,
                deliverTarget: name => invalidate(name, [{ kind: "dataset_cells_changed" }])
            });
        }
    });
    const cell = createRuntimeCellMutation({
        runtimeSessionManager: runtime,
        isCurrentRuntime: options.isCurrentRuntime,
        completed: options.publishCellUpdate,
        updated: result => invalidate(result.objectName, [{ kind: "dataset_cells_changed" }])
    });
    const columns = createDatasetViewerColumnMutation({
        runtimeSessionManager: runtime,
        isCurrentRuntime: options.isCurrentRuntime,
        uiCommandVisibility: options.uiCommandVisibility || (() => "hidden"),
        updated: (result, changes) => invalidate(result.objectName, changes)
    });
    const tabularColumns = createRuntimeColumnMutationActions({
        runtimeSessionManager: runtime,
        isCurrentRuntime: options.isCurrentRuntime,
        updated: result => invalidate(result.objectName, [
            { kind: "dataset_columns_changed", schemaChanged: true }
        ])
    });
    const rows = createDatasetViewerRowMutation({
        runtimeSessionManager: runtime,
        isCurrentRuntime: options.isCurrentRuntime,
        uiCommandVisibility: options.uiCommandVisibility || (() => "hidden"),
        updated: (result, changes) => invalidate(result.objectName, changes)
    });
    const tabularRows = createRuntimeRowMutationActions({
        runtimeSessionManager: runtime,
        isCurrentRuntime: options.isCurrentRuntime,
        updated: (result, changes) => invalidate(result.objectName, changes)
    });
    const variables = createDatasetViewerVariableMutation({
        runtimeSessionManager: runtime,
        isCurrentRuntime: options.isCurrentRuntime,
        patchVariableMetadata: options.patchVariableMetadata,
        updated: (result, changes, patched) => invalidate(result.objectName, changes, patched)
    });
    const metadata = createRuntimeTabularMetadataMutation({
        runtimeSessionManager: runtime,
        isCurrentRuntime: options.isCurrentRuntime,
        updated: result => invalidate(result.objectName, [{ kind: "dataset_variable_meta_changed" }])
    });
    const executeDatasetMethod = async function(
        method: string,
        params: Record<string, unknown>
    ) {
        return runtime.executeRuntimeMethod(
            createRuntimeExtensionMethodRequest({
                method,
                params,
                source: "base-app.dataset-editor"
            })
        );
    };

    return {
        readSchema: reads.readSchema,
        tabularColumns,
        tabularRows,
        readTabularSchema: tabularReads.readTabularSchema,
        readTabularPreview: tabularReads.readTabularPreview,
        readContent: reads.readContent,
        readFilterMask: reads.readFilterMask,
        readVariables: reads.readVariables,

        readVariableMetadata: metadataReads.readVariableMetadata,

        writeVariableMetadata: metadata.writeVariableMetadata,

        readValueLabels: metadataReads.readValueLabels,

        writeValueLabels: metadata.writeValueLabels,

        readDeclaredMissing: metadataReads.readDeclaredMissing,

        writeDeclaredMissing: metadata.writeDeclaredMissing,

        readVariableBatch: reads.readVariableBatch,

        updateCell: cells.updateCell,
        writeCell: cell.writeCell,

        updateColumnName: columns.updateColumnName,

        updateRowName: rows.updateRowName,
        insertRow: rows.insertRow,
        removeRow: rows.removeRow,

        insertColumn: columns.insertColumn,
        removeColumn: columns.removeColumn,

        sortRows: rows.sortRows,

        writeCells: cellBatch.writeCells,

        updateVariable: variables.updateVariable,

        async readDialogVariableValues(value: unknown) {
            const input = recordInput(value);
            const name = String(input.name || "").trim();
            const variableName = String(input.variableName || "").trim();

            if (!name || !variableName) {
                return createDialogVariableValuesResult(null, {
                    name,
                    variableName
                });
            }

            const result = await executeDatasetMethod(
                "workspace.dataset_values",
                {
                    name,
                    variableName
                }
            );

            return createDialogVariableValuesResult(
                result.status === "ready" ? result.value : null,
                {
                    name,
                    variableName,
                    error: result.status === "ready"
                        ? ""
                        : result.message || "Unable to read variable values."
                }
            );
        }
    };
};

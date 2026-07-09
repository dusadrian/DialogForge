import {
    createRDatasetCellValueCommand,
    createRDatasetValueLabelsCommand,
    createRDatasetVariableAttributeCommand,
    createRDatasetVariableNameCommand
} from "../r/commands/datasetEditorMutationCommands";
import {
    buildRDatasetEditorSnapshotCommand,
    buildRDatasetEditorVariableBatchCommand,
    parseRDatasetEditorSnapshot
} from "../r/commands/datasetEditorSnapshot";


interface WebRDatasetEditorRuntime {
    evalRVoid(command: string): Promise<void>;
    evalRString(command: string): Promise<string>;
}


interface WebRDatasetMissingRange {
    min?: unknown;
    max?: unknown;
}


export interface WebRDatasetEditorRuntimeBindingOptions {
    ensureRuntime(): Promise<WebRDatasetEditorRuntime>;
    invalidateDataset(datasetName: string): Promise<void> | void;
}


export const createWebRDatasetEditorRuntimeBindings = function(
    options: WebRDatasetEditorRuntimeBindingOptions
) {
    const invalidateDataset = async function(datasetName: string): Promise<void> {
        await options.invalidateDataset(String(datasetName || "").trim());
    };

    return {
        async readSnapshot(
            datasetName: string,
            rowStart: number,
            rowCount: number,
            columnStart: number,
            columnCount: number
        ) {
            const runtime = await options.ensureRuntime();
            const command = buildRDatasetEditorSnapshotCommand({
                datasetName,
                rowStart,
                rowCount,
                columnStart,
                columnCount
            });

            return parseRDatasetEditorSnapshot(
                await runtime.evalRString(command),
                datasetName
            );
        },

        async readVariableBatch(datasetName: string, start: number, count: number) {
            const runtime = await options.ensureRuntime();
            const command = buildRDatasetEditorVariableBatchCommand({
                datasetName,
                start,
                count
            });

            return parseRDatasetEditorSnapshot(
                await runtime.evalRString(command),
                datasetName
            ).variables;
        },

        async writeCellValue(
            datasetName: string,
            rowIndex: number,
            columnName: string,
            value: unknown
        ): Promise<void> {
            const runtime = await options.ensureRuntime();

            await runtime.evalRVoid(
                createRDatasetCellValueCommand(
                    datasetName,
                    rowIndex,
                    columnName,
                    value
                )
            );
            await invalidateDataset(datasetName);
        },

        async writeVariableName(
            datasetName: string,
            columnIndex: number,
            value: unknown
        ): Promise<void> {
            const runtime = await options.ensureRuntime();

            await runtime.evalRVoid(
                createRDatasetVariableNameCommand(
                    datasetName,
                    columnIndex,
                    value
                )
            );
            await invalidateDataset(datasetName);
        },

        async writeVariableAttribute(
            datasetName: string,
            columnIndex: number,
            attributeName: string,
            value: unknown
        ): Promise<void> {
            const runtime = await options.ensureRuntime();

            await runtime.evalRVoid(
                createRDatasetVariableAttributeCommand(
                    datasetName,
                    columnIndex,
                    attributeName,
                    value
                )
            );
            await invalidateDataset(datasetName);
        },

        async writeValueLabels(
            datasetName: string,
            columnIndex: number,
            categories: unknown,
            missingRange: WebRDatasetMissingRange | null | undefined
        ): Promise<void> {
            const runtime = await options.ensureRuntime();

            await runtime.evalRVoid(
                createRDatasetValueLabelsCommand(
                    datasetName,
                    columnIndex,
                    categories,
                    missingRange
                )
            );
            await invalidateDataset(datasetName);
        }
    };
};

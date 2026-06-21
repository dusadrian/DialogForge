import type {
    DatasetViewerSchema
} from "../../base-app/modules/datasetViewer.types";
import {
    createDatasetColumnWidths
} from "./initialDatasetPage";


export interface DatasetSchemaSnapshot {
    schema: DatasetViewerSchema | null;
    columnWidths: number[];
}


export interface DatasetSchemaState {
    readonly snapshot: DatasetSchemaSnapshot;
    clear(): void;
    setSchema(schema: DatasetViewerSchema): void;
    setColumnWidths(columnWidths: number[]): void;
    applySchema(schema: DatasetViewerSchema): void;
}


export const createDatasetSchemaState = function(): DatasetSchemaState {
    let schema: DatasetViewerSchema | null = null;
    let columnWidths: number[] = [];

    return {
        get snapshot(): DatasetSchemaSnapshot {
            return {
                schema,
                columnWidths
            };
        },
        clear: function(): void {
            schema = null;
        },
        setSchema: function(nextSchema): void {
            schema = nextSchema;
        },
        setColumnWidths: function(nextColumnWidths): void {
            columnWidths = nextColumnWidths;
        },
        applySchema: function(nextSchema): void {
            schema = nextSchema;
            columnWidths = createDatasetColumnWidths(
                Array.isArray(nextSchema.columns)
                    ? nextSchema.columns
                    : []
            );
        }
    };
};

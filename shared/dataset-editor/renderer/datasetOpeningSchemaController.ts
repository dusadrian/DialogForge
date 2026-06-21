import type {
    DatasetViewerSchema
} from "../../base-app/modules/datasetViewer.types";
import {
    createDatasetColumnWidths
} from "../state/initialDatasetPage";


export interface DatasetOpeningSchemaControllerOptions {
    initialColumnCount(): number;
    setSchema(schema: DatasetViewerSchema): void;
    setColumnWidths(widths: number[]): void;
    renderTitle(): void;
    loadWindow(
        rowStart: number,
        rowCount: number,
        columnStart: number,
        columnEnd: number
    ): Promise<void>;
}


export const createDatasetOpeningSchemaController = function(
    options: DatasetOpeningSchemaControllerOptions
) {
    const apply = function(schema: DatasetViewerSchema): void {
        options.setSchema(schema);
        options.renderTitle();
        options.setColumnWidths(
            createDatasetColumnWidths(
                Array.isArray(schema.columns)
                    ? schema.columns
                    : []
            )
        );
    };

    const loadFallbackPage = async function(
        schema: DatasetViewerSchema,
        initialRowCount: number
    ): Promise<void> {
        await options.loadWindow(
            1,
            Math.min(
                initialRowCount,
                Math.max(
                    1,
                    Number(schema.rowCount || initialRowCount)
                )
            ),
            1,
            Math.min(
                Math.max(1, Number(schema.columnCount || 1)),
                options.initialColumnCount()
            )
        );
    };

    return {
        apply,
        loadFallbackPage
    };
};

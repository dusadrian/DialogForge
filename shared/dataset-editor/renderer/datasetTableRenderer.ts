import type {
    DatasetVariableMetadata,
    DatasetViewerCell,
    DatasetViewerContentPage,
    DatasetViewerSchema
} from "../../base-app/modules/datasetViewer.types";
import type {
    DatasetVariableColumnKey
} from "../clipboard/editorClipboardState";
import { renderDataTable } from "./dataTableView";
import { renderVariableMetadataTable } from "./variableTableView";


export interface DatasetTableRendererOptions {
    rowHeight: number;
    headerHeight: number;
    minimumRowHeaderWidth: number;
    getDataHost(): HTMLElement | null;
    getVariablesHost(): HTMLElement | null;
    getSchema(): DatasetViewerSchema | null;
    getDataLoadFailed(): boolean;
    getDataColumns(): DatasetViewerContentPage["columns"];
    getDataColumnWidths(): number[];
    getDataRowNames(): string[];
    getDataRows(): DatasetViewerCell[][];
    getFilteredRows(): boolean[];
    getLoadedRowStart(): number;
    getLoadedColumnStart(): number;
    getSelectedDataColumn(): string;
    getSelectedDataRow(): number;
    getActiveDataCell(): {
        row: number;
        column: string;
    } | null;
    getActiveDataEdit(): {
        row: number;
        column: string;
    } | null;
    getActiveColumnHeaderEdit(): string | null;
    getActiveRowNameEdit(): number | null;
    getVariables(): DatasetVariableMetadata[] | null;
    getVariableColumnWidths(): Record<DatasetVariableColumnKey, number>;
    getSelectedVariableRow(): number;
    getActiveVariableRow(): number;
    isVariableMetadataLoaded(): boolean;
    isVariableCellSelected(
        rowIndex: number,
        key: DatasetVariableColumnKey
    ): boolean;
    translate(key: string): string;
    escapeHtml(value: string): string;
    renderDataStatus(message: string): void;
    renderVariablesStatus(message: string): void;
    bindDataInteractions(host: HTMLElement): void;
    bindVariableInteractions(
        host: HTMLElement,
        table: HTMLElement
    ): void;
}


export interface DatasetTableRenderer {
    renderData(): void;
    renderVariables(): void;
}


export const createDatasetTableRenderer = function(
    options: DatasetTableRendererOptions
): DatasetTableRenderer {
    const renderData = function(): void {
        const host = options.getDataHost();
        const schema = options.getSchema();

        if (!host) {
            return;
        }

        if (!schema) {
            options.renderDataStatus(
                options.translate("No dataset selected")
            );
            return;
        }

        if (options.getDataLoadFailed()) {
            options.renderDataStatus(
                options.translate("Could not load dataset content")
            );
            return;
        }

        const columns = options.getDataColumns();

        if (!columns.length) {
            options.renderDataStatus(
                options.translate("No data available")
            );
            return;
        }

        host.innerHTML = renderDataTable({
            viewportWidth: host.clientWidth || 0,
            viewportHeight: host.clientHeight || 0,
            rowHeight: options.rowHeight,
            headerHeight: options.headerHeight,
            minimumRowHeaderWidth: options.minimumRowHeaderWidth,
            totalRowCount: Number(schema.rowCount || 0),
            loadedRowStart: options.getLoadedRowStart(),
            loadedColumnStart: options.getLoadedColumnStart(),
            columns,
            columnWidths: options.getDataColumnWidths(),
            rowNames: options.getDataRowNames(),
            rows: options.getDataRows(),
            filteredOut: options.getFilteredRows(),
            selectedColumnName: options.getSelectedDataColumn(),
            selectedRowNumber: options.getSelectedDataRow(),
            activeCell: options.getActiveDataCell(),
            activeEdit: options.getActiveDataEdit(),
            activeColumnHeaderEdit:
                options.getActiveColumnHeaderEdit(),
            activeRowNameEdit: options.getActiveRowNameEdit(),
            translate: options.translate,
            escapeHtml: options.escapeHtml
        });
        options.bindDataInteractions(host);
    };

    const renderVariables = function(): void {
        const host = options.getVariablesHost();

        if (!host) {
            return;
        }

        const variables = options.getVariables();
        const items = Array.isArray(variables)
            ? variables
            : [];

        if (!items.length) {
            options.renderVariablesStatus(
                options.isVariableMetadataLoaded()
                    ? options.translate(
                        "No variable metadata available"
                    )
                    : ""
            );
            return;
        }

        host.innerHTML = renderVariableMetadataTable({
            variables: items,
            columnWidths: options.getVariableColumnWidths(),
            selectedRowIndex: options.getSelectedVariableRow(),
            activeRowIndex: options.getActiveVariableRow(),
            translate: options.translate,
            escapeHtml: options.escapeHtml,
            isCellSelected: options.isVariableCellSelected
        });

        const table = host.querySelector<HTMLElement>(
            "table.dataset-grid--variables"
        );

        if (table) {
            options.bindVariableInteractions(host, table);
        }
    };

    return {
        renderData,
        renderVariables
    };
};

import type {
    DatasetVariableMetadata,
    DatasetViewerSchema
} from "../../base-app/modules/datasetViewer.types";


export interface DatasetNavigationControllerOptions {
    window: Window;
    rowHeight: number;
    minimumRowHeaderWidth: number;
    getDatasetName(): string;
    getSchema(): DatasetViewerSchema | null;
    getVariables(): DatasetVariableMetadata[] | null;
    getRowNames(): string[];
    getColumnWidths(): number[];
    getDataHost(): HTMLElement | null;
    setActiveTab(tab: "data" | "variables"): void;
    selectDataColumn(columnName: string): void;
    selectVariableRow(rowIndex: number): void;
    clearDataSelection(): void;
    prioritizeVariableRow(rowIndex: number): void;
    queueViewportRefresh(): void;
}


export interface DatasetNavigationController {
    jumpToVariable(columnName: string): void;
    jumpToDataColumnForVariable(rowIndex: number): void;
    jumpToDataColumn(columnName: string): void;
    jumpToCase(caseNumber: unknown): void;
}


const findSchemaColumnIndex = function(
    schema: DatasetViewerSchema | null,
    columnName: string
): number {
    const columns = Array.isArray(schema?.columns)
        ? schema.columns
        : [];

    return columns.findIndex((column) => {
        return String(column?.name || "") === columnName;
    });
};


export const createDatasetNavigationController = function(
    options: DatasetNavigationControllerOptions
): DatasetNavigationController {
    const dataRowHeaderWidth = function(): number {
        const rowNames = options.getRowNames();

        return Math.max(
            options.minimumRowHeaderWidth,
            Math.min(
                180,
                Math.max(
                    58,
                    ...rowNames.map((value) => {
                        return String(value || "").length * 9 + 18;
                    })
                )
            )
        );
    };

    const scrollDataColumnIntoView = function(columnIndex: number): void {
        const host = options.getDataHost();

        if (!host) {
            return;
        }

        const rowHeaderWidth = dataRowHeaderWidth();
        const columnWidths = options.getColumnWidths();
        const columnLeft = rowHeaderWidth + columnWidths
            .slice(0, columnIndex)
            .reduce((sum, width) => {
                return sum + (Number(width) || 0);
            }, 0);
        const columnWidth = Math.max(
            40,
            Number(columnWidths[columnIndex] || 120)
        );
        const visibleLeft = Math.max(
            0,
            host.scrollLeft + rowHeaderWidth
        );
        const visibleRight = Math.max(
            visibleLeft,
            host.scrollLeft + Math.max(0, host.clientWidth || 0)
        );
        let nextScrollLeft = host.scrollLeft;

        if (columnLeft < visibleLeft) {
            nextScrollLeft = columnLeft - rowHeaderWidth;
        }
        else if (columnLeft + columnWidth > visibleRight) {
            nextScrollLeft = columnLeft
                + columnWidth
                - Math.max(0, host.clientWidth || 0);
        }

        host.scrollLeft = Math.max(0, nextScrollLeft);
        options.queueViewportRefresh();
    };

    const jumpToVariable = function(columnName: string): void {
        const target = String(columnName || "").trim();
        const schema = options.getSchema();

        if (!target || !options.getDatasetName() || !schema) {
            return;
        }

        const rowIndex = findSchemaColumnIndex(schema, target);

        if (rowIndex < 0) {
            return;
        }

        options.selectDataColumn(target);
        options.clearDataSelection();
        options.selectVariableRow(rowIndex);
        options.prioritizeVariableRow(rowIndex);
        options.setActiveTab("variables");
    };

    const jumpToDataColumnForVariable = function(rowIndex: number): void {
        const schema = options.getSchema();

        if (rowIndex < 0 || !options.getDatasetName() || !schema) {
            return;
        }

        const variables = options.getVariables();
        const entry = (
            Array.isArray(variables)
            && rowIndex < variables.length
        )
            ? variables[rowIndex]
            : null;
        const columnName = String(entry?.name || "").trim();

        if (!columnName) {
            return;
        }

        const columnIndex = findSchemaColumnIndex(schema, columnName);

        if (columnIndex < 0) {
            return;
        }

        options.selectVariableRow(rowIndex);
        options.selectDataColumn(columnName);
        options.clearDataSelection();
        options.setActiveTab("data");
        scrollDataColumnIntoView(columnIndex);
    };

    const jumpToDataColumn = function(columnName: string): void {
        const target = String(columnName || "").trim();
        const schema = options.getSchema();

        if (!target || !options.getDatasetName() || !schema) {
            return;
        }

        const columnIndex = findSchemaColumnIndex(schema, target);

        if (columnIndex < 0) {
            return;
        }

        options.selectDataColumn(target);
        options.clearDataSelection();
        options.setActiveTab("data");
        scrollDataColumnIntoView(columnIndex);
    };

    const jumpToCase = function(caseNumber: unknown): void {
        const schema = options.getSchema();

        if (!options.getDatasetName() || !schema) {
            return;
        }

        const rowCount = Math.max(0, Number(schema.rowCount || 0));

        if (!rowCount) {
            return;
        }

        const requested = Math.round(Number(caseNumber || 0));

        if (!Number.isFinite(requested)) {
            return;
        }

        const host = options.getDataHost();

        if (!host) {
            return;
        }

        const clamped = Math.max(1, Math.min(rowCount, requested));

        options.setActiveTab("data");
        host.scrollTop = Math.max(
            0,
            (clamped - 1) * options.rowHeight
        );
        options.queueViewportRefresh();
    };

    return {
        jumpToVariable,
        jumpToDataColumnForVariable,
        jumpToDataColumn,
        jumpToCase
    };
};

import type {
    TabularPreviewSnapshot,
    VariableMetadataSnapshot
} from "../../runtime/provider-contract/runtimeProvider";
import type {
    DatasetEditorState
} from "../state/datasetEditorState";
import {
    createDatasetColumnLayoutKey,
    datasetEditorReducer
} from "../state/datasetEditorState";


export interface DatasetLayoutControllerBindings {
    getState(): DatasetEditorState;
    setState(state: DatasetEditorState): void;
    getPreview(): TabularPreviewSnapshot | null;
    getMetadata(): VariableMetadataSnapshot | null;
    getObjectName(): string;
    renderPreview(preview: TabularPreviewSnapshot): void;
    renderMetadata(metadata: VariableMetadataSnapshot): void;
    renderStatus(result: { status: string; message: string }): void;
}


export interface DatasetLayoutController {
    syncColumnOrder(preview: TabularPreviewSnapshot): void;
    renderControls(): void;
    applyDataViewport(): void;
    shiftDataViewport(rowDelta: number, columnDelta: number): void;
    applyVariableViewport(): void;
    shiftVariableViewport(rowDelta: number): void;
    applyColumnWidth(widthOverride?: number): void;
    resizeColumn(delta: number): void;
    moveColumn(delta: number): void;
}


const inputById = function(id: string): HTMLInputElement {
    const element = document.getElementById(id);

    if (!(element instanceof HTMLInputElement)) {
        throw new Error("Missing dataset layout input: " + id);
    }

    return element;
};


export const createDatasetLayoutController = function(
    bindings: DatasetLayoutControllerBindings
): DatasetLayoutController {
    const readInteger = function(
        id: string,
        fallback: number,
        minimum: number
    ): number {
        const value = Math.floor(Number(inputById(id).value));

        return !Number.isFinite(value) || value < minimum
            ? fallback
            : value;
    };

    const setInteger = function(id: string, value: number): void {
        inputById(id).value = String(value);
    };

    const selectedColumnName = function(): string {
        const selection = bindings.getState().selection;

        if (
            selection.kind === "data-column"
            || selection.kind === "data-cell"
        ) {
            return selection.columnName;
        }

        return "";
    };

    const currentColumnOrder = function(): string[] {
        const objectName = bindings.getObjectName();
        const preview = bindings.getPreview();

        if (!objectName || !preview || preview.status !== "ready") {
            return [];
        }

        return bindings.getState().columnOrder[objectName]
            || preview.columns.map((column) => column.name);
    };

    const renderControls = function(): void {
        const state = bindings.getState();
        const viewport = state.viewport;
        const selectedColumn = selectedColumnName();
        const widthKey = createDatasetColumnLayoutKey(
            bindings.getObjectName(),
            selectedColumn
        );
        const width = selectedColumn && state.columnWidths[widthKey]
            ? state.columnWidths[widthKey]
            : 96;

        setInteger("dataStartRow", viewport.dataStartRow);
        setInteger("dataVisibleRows", viewport.dataVisibleRows);
        setInteger("dataStartColumn", viewport.dataStartColumn);
        setInteger("dataVisibleColumns", viewport.dataVisibleColumns);
        setInteger("selectedColumnWidth", width);
        setInteger("variableStartRow", viewport.variableStartRow);
        setInteger("variableVisibleRows", viewport.variableVisibleRows);
    };

    const rerenderTables = function(): void {
        renderControls();

        const preview = bindings.getPreview();
        const metadata = bindings.getMetadata();

        if (preview) {
            bindings.renderPreview(preview);
        }

        if (metadata) {
            bindings.renderMetadata(metadata);
        }
    };

    const updateState = function(action: Parameters<typeof datasetEditorReducer>[1]): void {
        bindings.setState(datasetEditorReducer(bindings.getState(), action));
    };

    const syncColumnOrder = function(preview: TabularPreviewSnapshot): void {
        if (preview.status !== "ready" || !preview.objectName) {
            return;
        }

        const sourceColumns = preview.columns.map((column) => column.name);
        const currentOrder = bindings.getState().columnOrder[preview.objectName] || [];
        const nextOrder: string[] = [];

        currentOrder.forEach((columnName) => {
            if (
                sourceColumns.indexOf(columnName) >= 0
                && nextOrder.indexOf(columnName) < 0
            ) {
                nextOrder.push(columnName);
            }
        });
        sourceColumns.forEach((columnName) => {
            if (nextOrder.indexOf(columnName) < 0) {
                nextOrder.push(columnName);
            }
        });

        if (
            nextOrder.length !== currentOrder.length
            || nextOrder.some((columnName, index) => {
                return currentOrder[index] !== columnName;
            })
        ) {
            updateState({
                type: "setColumnOrder",
                objectName: preview.objectName,
                columnNames: nextOrder
            });
        }
    };

    const applyDataViewport = function(): void {
        const viewport = bindings.getState().viewport;

        updateState({
            type: "setViewport",
            viewport: {
                dataStartRow: readInteger("dataStartRow", viewport.dataStartRow, 0),
                dataVisibleRows: readInteger("dataVisibleRows", viewport.dataVisibleRows, 1),
                dataStartColumn: readInteger("dataStartColumn", viewport.dataStartColumn, 0),
                dataVisibleColumns: readInteger("dataVisibleColumns", viewport.dataVisibleColumns, 1)
            }
        });
        bindings.renderStatus({
            status: "ready",
            message: "Dataset viewport updated."
        });
        rerenderTables();
    };

    const shiftDataViewport = function(
        rowDelta: number,
        columnDelta: number
    ): void {
        const viewport = bindings.getState().viewport;

        updateState({
            type: "setViewport",
            viewport: {
                dataStartRow: Math.max(0, viewport.dataStartRow + rowDelta),
                dataStartColumn: Math.max(0, viewport.dataStartColumn + columnDelta)
            }
        });
        bindings.renderStatus({
            status: "ready",
            message: "Dataset viewport moved."
        });
        rerenderTables();
    };

    const applyVariableViewport = function(): void {
        const viewport = bindings.getState().viewport;

        updateState({
            type: "setViewport",
            viewport: {
                variableStartRow: readInteger("variableStartRow", viewport.variableStartRow, 0),
                variableVisibleRows: readInteger("variableVisibleRows", viewport.variableVisibleRows, 1)
            }
        });
        rerenderTables();
    };

    const shiftVariableViewport = function(rowDelta: number): void {
        const viewport = bindings.getState().viewport;

        updateState({
            type: "setViewport",
            viewport: {
                variableStartRow: Math.max(0, viewport.variableStartRow + rowDelta)
            }
        });
        rerenderTables();
    };

    const applyColumnWidth = function(widthOverride?: number): void {
        const objectName = bindings.getObjectName();
        const columnName = selectedColumnName();
        const width = widthOverride === undefined
            ? readInteger("selectedColumnWidth", 96, 24)
            : Math.max(24, Math.round(widthOverride));

        if (!objectName || !columnName) {
            bindings.renderStatus({
                status: "unavailable",
                message: "Select a data column before changing column width."
            });
            return;
        }

        updateState({
            type: "setColumnWidth",
            objectName,
            columnName,
            width
        });
        bindings.renderStatus({
            status: "ready",
            message: "Column width updated."
        });
        rerenderTables();
    };

    const resizeColumn = function(delta: number): void {
        const state = bindings.getState();
        const widthKey = createDatasetColumnLayoutKey(
            bindings.getObjectName(),
            selectedColumnName()
        );
        const currentWidth = state.columnWidths[widthKey]
            || readInteger("selectedColumnWidth", 96, 24);

        applyColumnWidth(currentWidth + delta);
    };

    const moveColumn = function(delta: number): void {
        const objectName = bindings.getObjectName();
        const columnName = selectedColumnName();
        const order = currentColumnOrder();
        const sourceIndex = order.indexOf(columnName);

        if (!objectName || !columnName || sourceIndex < 0) {
            bindings.renderStatus({
                status: "unavailable",
                message: "Select a data column before moving it."
            });
            return;
        }

        updateState({
            type: "moveColumn",
            objectName,
            columnName,
            targetIndex: Math.max(
                0,
                Math.min(order.length - 1, sourceIndex + delta)
            )
        });
        bindings.renderStatus({
            status: "ready",
            message: "Column order updated."
        });
        rerenderTables();
    };

    return {
        syncColumnOrder,
        renderControls,
        applyDataViewport,
        shiftDataViewport,
        applyVariableViewport,
        shiftVariableViewport,
        applyColumnWidth,
        resizeColumn,
        moveColumn
    };
};

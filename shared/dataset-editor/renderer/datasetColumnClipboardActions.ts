import type {
    DatasetVariableMetadata,
    DatasetViewerCell,
    DatasetViewerContentPage
} from "../../base-app/modules/datasetViewer.types";
import type {
    DatasetEditorClipboardState
} from "../clipboard/editorClipboardState";
import { quoteTsvCell } from "../clipboard/editorClipboardState";
import {
    asRObjectReference,
    asRStringLiteral
} from "../commands/visibleCommandText";
import {
    readDatasetCellRawValue,
    readDatasetCellValueLabel
} from "../view/cellText";


export interface DatasetColumnClipboardActionsOptions {
    clipboardState: DatasetEditorClipboardState;
    getDatasetName(): string;
    getRowCount(): number;
    getColumnNames(): string[];
    getContent(
        datasetName: string,
        request: {
            rowStart: number;
            rowCount: number;
            columns: string[];
        }
    ): Promise<DatasetViewerContentPage | null>;
    getVariableMetadata(
        columnName: string
    ): Promise<DatasetVariableMetadata | null>;
    writeClipboard(text: string): Promise<boolean>;
    readClipboard(): Promise<string>;
    runCommand(command: string, visible: boolean): Promise<boolean>;
    refreshDataset(datasetName: string): Promise<void>;
    hideHeaderMenu(): void;
    showLoading(message: string): void;
    hideLoading(): void;
    showNotice(message: string): void;
    translate(key: string): string;
}


export interface DatasetColumnClipboardActions {
    copy(
        columnName: string,
        options?: {
            includeLabels?: boolean;
        }
    ): Promise<void>;
    paste(columnName: string): Promise<void>;
}


export const createDatasetColumnClipboardActions = function(
    options: DatasetColumnClipboardActionsOptions
): DatasetColumnClipboardActions {
    const fetchColumn = async function(
        columnName: string
    ): Promise<DatasetViewerCell[] | null> {
        const datasetName = options.getDatasetName();
        const rowCount = Math.max(0, options.getRowCount());

        if (!datasetName || !columnName || rowCount === 0) {
            return [];
        }

        const cells: DatasetViewerCell[] = [];
        const batchSize = 2000;

        for (
            let rowStart = 1;
            rowStart <= rowCount;
            rowStart += batchSize
        ) {
            const page = await options.getContent(
                datasetName,
                {
                    rowStart,
                    rowCount: Math.min(
                        batchSize,
                        rowCount - rowStart + 1
                    ),
                    columns: [columnName]
                }
            );

            if (!page || !Array.isArray(page.rows)) {
                return null;
            }

            page.rows.forEach((row) => {
                cells.push(
                    (Array.isArray(row) ? row[0] : null)
                    || {
                        display: "",
                        raw: ""
                    }
                );
            });
        }

        return cells;
    };

    const copy = async function(
        columnInput: string,
        copyOptions?: {
            includeLabels?: boolean;
        }
    ): Promise<void> {
        const datasetName = options.getDatasetName();
        const columnName = String(columnInput || "").trim();
        const includeLabels = copyOptions?.includeLabels === true;

        if (!datasetName || !columnName) {
            return;
        }

        options.hideHeaderMenu();
        options.showLoading(
            options.translate(
                includeLabels
                    ? "Copying values and labels..."
                    : "Copying column..."
            )
        );

        try {
            const cells = await fetchColumn(columnName);

            if (!cells) {
                options.showNotice(
                    options.translate("Column copy failed")
                );
                return;
            }

            const metadata = includeLabels
                ? await options.getVariableMetadata(columnName)
                : null;
            const rawValues = cells.map(readDatasetCellRawValue);
            const labelValues = includeLabels
                ? cells.map((cell) => {
                    return readDatasetCellValueLabel(cell, metadata);
                })
                : [];
            const text = includeLabels
                ? rawValues.map((value, index) => {
                    return [
                        quoteTsvCell(value),
                        quoteTsvCell(labelValues[index] ?? "")
                    ].join("\t");
                }).join("\n")
                : rawValues.map(quoteTsvCell).join("\n");
            const copied = await options.writeClipboard(text);

            if (!copied) {
                options.showNotice(
                    options.translate("Clipboard copy failed")
                );
                return;
            }

            options.clipboardState.clearVariableMetadata();
            options.clipboardState.setDataColumn(
                datasetName,
                columnName,
                cells.length,
                includeLabels
                    ? "values-and-labels"
                    : "values",
                text
            );
            options.showNotice(
                options.translate(
                    includeLabels
                        ? "Column values and labels copied"
                        : "Column values copied"
                )
            );
        }
        finally {
            options.hideLoading();
        }
    };

    const paste = async function(
        columnInput: string
    ): Promise<void> {
        const datasetName = options.getDatasetName();
        const columnName = String(columnInput || "").trim();

        if (!datasetName || !columnName) {
            return;
        }

        options.hideHeaderMenu();
        const text = await options.readClipboard();
        const payload = options.clipboardState.readDataColumn(text);
        const rowCount = Math.max(0, options.getRowCount());
        const hasSourceColumn = Boolean(
            payload
            && options.getColumnNames().includes(payload.columnName)
        );

        if (
            !payload
            || payload.datasetName !== datasetName
            || payload.rowCount !== rowCount
            || !hasSourceColumn
        ) {
            options.showNotice(
                options.translate("Copy a variable first")
            );
            return;
        }

        options.showLoading(options.translate("Pasting column..."));

        try {
            const datasetReference = asRObjectReference(datasetName);
            const targetReference = (
                `${datasetReference}[[${asRStringLiteral(columnName)}]]`
            );
            const sourceReference = (
                `${datasetReference}[[${asRStringLiteral(payload.columnName)}]]`
            );
            const command = payload.mode === "values"
                ? `${targetReference} <- local({ .source <- ${sourceReference}; if (inherits(.source, "declared") && requireNamespace("declared", quietly = TRUE)) .source <- declared::undeclare(.source, drop = TRUE); .source })`
                : `${targetReference} <- ${sourceReference}`;
            const pasted = await options.runCommand(command, false);

            if (!pasted) {
                options.showNotice(
                    options.translate("Column paste failed")
                );
                return;
            }

            await options.refreshDataset(datasetName);
            options.showNotice(options.translate("Column pasted"));
        }
        finally {
            options.hideLoading();
        }
    };

    return {
        copy,
        paste
    };
};

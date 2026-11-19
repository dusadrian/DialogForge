import type {
    ColumnClipboardPageRequest,
    ColumnClipboardPage
} from "../../runtime/tabular-data/datasetViewerTypes";
import type {
    DatasetEditorClipboardState
} from "../clipboard/editorClipboardState";
import { normalizeClipboardText } from "./datasetEditorRendererTransport";
import { quoteTsvCell } from "../clipboard/editorClipboardState";
import {
    asRObjectReference,
    asRStringLiteral
} from "../commands/visibleCommandText";


export interface DatasetColumnClipboardActionsOptions {
    clipboardState: DatasetEditorClipboardState;
    getDatasetName(): string;
    getMetadataSequence(): number;
    getRowCount(): number;
    readColumnClipboardPage(request: ColumnClipboardPageRequest): Promise<ColumnClipboardPage | null>;
    writeClipboard(text: string): Promise<boolean>;
    readClipboard(): Promise<string | null>;
    runCommand(command: string, visible: boolean): Promise<boolean>;
    refreshDataset(datasetName: string): Promise<void>;
    hideHeaderMenu(): void;
    showLoading(message: string): () => void;
    showNotice(message: string): void;
    translate(key: string): string;
}


export interface DatasetColumnClipboardActions {
    invalidate(): void;
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
    let operationSequence = 0;

    let lastCopiedKey = "";

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

        const sequence = ++operationSequence;
        const metadataSequence = options.getMetadataSequence();
        const rowCount = Math.max(0, options.getRowCount());
        const isCurrent = function(): boolean {
            return sequence === operationSequence
                && datasetName === options.getDatasetName()
                && metadataSequence === options.getMetadataSequence();
        };
        options.hideHeaderMenu();
        const releaseLoading = options.showLoading(
            options.translate(
                includeLabels
                    ? "Copying values and labels..."
                    : "Copying column..."
            )
        );

        try {
            const snapshotKey = crypto.randomUUID();
            const textPages: string[] = [];
            let copiedRows = 0;
            do {
                const page = await options.readColumnClipboardPage({
                    name: datasetName, column: columnName, key: snapshotKey, retainKey: lastCopiedKey,
                    rowStart: copiedRows + 1, includeLabels
                });
                if (!isCurrent()) {
                    return;
                }
                if (!page || page.total !== rowCount || !Array.isArray(page.values)
                    || copiedRows + page.values.length > rowCount || (rowCount && !page.values.length)) {
                    options.showNotice(options.translate("Column copy failed"));
                    return;
                }
                const lines = page.values.map(value => {
                    const raw = typeof value === "string" ? value : value[0];
                    if (!includeLabels) {
                        return quoteTsvCell(raw);
                    }
                    const display = typeof value === "string" ? value : value[1];
                    return quoteTsvCell(raw) + "\t" + quoteTsvCell(display);
                });
                textPages.push(lines.join("\n"));
                copiedRows += lines.length;
            } while (copiedRows < rowCount);

            const text = normalizeClipboardText(textPages.join("\n"));
            const copied = await options.writeClipboard(text);
            if (!isCurrent()) {
                return;
            }

            if (!copied) {
                options.showNotice(
                    options.translate("Clipboard copy failed")
                );
                return;
            }

            options.clipboardState.clearVariableMetadata();
            if (!isCurrent()) {
                return;
            }
            options.clipboardState.setDataColumn(
                datasetName,
                columnName,
                copiedRows,
                includeLabels
                    ? "values-and-labels"
                    : "values",
                text,
                snapshotKey
            );
            lastCopiedKey = snapshotKey;
            if (!isCurrent()) {
                return;
            }
            options.showNotice(
                options.translate(
                    includeLabels
                        ? "Column values and labels copied"
                        : "Column values copied"
                )
            );
        }
        finally {
            releaseLoading();
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

        const sequence = ++operationSequence;
        const metadataSequence = options.getMetadataSequence();
        const isCurrentOperation = function(): boolean {
            return sequence === operationSequence && datasetName === options.getDatasetName();
        };
        const isCurrentSource = function(): boolean {
            return isCurrentOperation() && metadataSequence === options.getMetadataSequence();
        };
        options.hideHeaderMenu();
        const text = await options.readClipboard();
        if (!isCurrentSource()) {
            return;
        }
        if (text === null) {
            options.showNotice(options.translate("Clipboard read failed"));
            return;
        }
        const payload = options.clipboardState.readDataColumn(text);
        const rowCount = Math.max(0, options.getRowCount());
        if (
            !payload
            || payload.datasetName !== datasetName
            || payload.rowCount !== rowCount
            || !payload.snapshotKey
        ) {
            options.showNotice(
                options.translate("Copy a variable first")
            );
            return;
        }

        const releaseLoading = options.showLoading(options.translate("Pasting column..."));

        try {
            if (!isCurrentSource()) {
                return;
            }
            const datasetReference = asRObjectReference(datasetName);
            const targetReference = (
                `${datasetReference}[[${asRStringLiteral(columnName)}]]`
            );
            const copy = 'as.environment("DialogApp")$app_env$workspace_copied_column';
            const includeLabels = payload.mode === "values-and-labels" ? "TRUE" : "FALSE";
            const command = `${targetReference} <- ${copy}(${asRStringLiteral(payload.snapshotKey)}, nrow(${datasetReference}), ${includeLabels})`;
            const pasted = await options.runCommand(command, false);
            if (!isCurrentSource()) {
                return;
            }

            if (!pasted) {
                options.showNotice(
                    options.translate("Column paste failed")
                );
                return;
            }

            await options.refreshDataset(datasetName);
            if (isCurrentOperation()) {
                options.showNotice(options.translate("Column pasted"));
            }
        }
        finally {
            releaseLoading();
        }
    };

    return {
        invalidate: function(): void {
            operationSequence += 1;
        },
        copy,
        paste
    };
};

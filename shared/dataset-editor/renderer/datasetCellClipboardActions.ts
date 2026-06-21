import type {
    DatasetVariableMetadata,
    DatasetViewerCell
} from "../../base-app/modules/datasetViewer.types";
import type {
    DatasetVariableColumnKey,
    VariableMetadataClipboardPayload
} from "../clipboard/editorClipboardState";
import {
    readDatasetCellRawValue
} from "../view/cellText";


export type DatasetCellClipboardTarget =
    | {
        kind: "data";
        row: number;
        column: string;
    }
    | {
        kind: "variable";
        rowIndex: number;
        key: DatasetVariableColumnKey;
        selectionRows?: number[];
    };


type VariableTarget = Extract<
    DatasetCellClipboardTarget,
    { kind: "variable" }
>;


export interface DatasetCellClipboardActionsOptions {
    getTarget(): DatasetCellClipboardTarget | null;
    hideMenu(): void;
    isVariableRange(target: VariableTarget): boolean;
    getVariableRows(target: VariableTarget): number[];
    getDataCell(
        target: Extract<
            DatasetCellClipboardTarget,
            { kind: "data" }
        >
    ): DatasetViewerCell | null;
    getVariable(rowIndex: number): DatasetVariableMetadata | null;
    clearDataColumnClipboard(): void;
    clearVariableMetadataClipboard(): void;
    makeVariableMetadataText(
        variable: DatasetVariableMetadata,
        key: DatasetVariableColumnKey
    ): string;
    readVariableMetadata(
        text: string
    ): VariableMetadataClipboardPayload | null;
    writeClipboard(text: string): Promise<boolean>;
    readClipboard(): Promise<string>;
    updateDataCell(
        row: number,
        column: string,
        value: string
    ): Promise<DatasetViewerCell | null>;
    replaceLoadedDataCell(
        row: number,
        column: string,
        cell: DatasetViewerCell
    ): void;
    renderData(): void;
    getVariableField(
        rowIndex: number,
        key: DatasetVariableColumnKey
    ): HTMLInputElement | HTMLSelectElement | null;
    applyVariableText(
        target: VariableTarget,
        field: HTMLInputElement | HTMLSelectElement,
        text: string
    ): Promise<void>;
    applyVariableValues(
        rowIndex: number,
        payload: Extract<
            VariableMetadataClipboardPayload,
            { key: "values" }
        >
    ): Promise<boolean>;
    clearVariableRange(): void;
    renderVariables(): void;
    refreshDataset(): Promise<void>;
    showNotice(message: string): void;
    translate(key: string): string;
}


export interface DatasetCellClipboardActions {
    copyTarget(): Promise<void>;
    pasteTarget(): Promise<void>;
}


export const createDatasetCellClipboardActions = function(
    options: DatasetCellClipboardActionsOptions
): DatasetCellClipboardActions {
    const copyTarget = async function(): Promise<void> {
        const target = options.getTarget();
        options.hideMenu();

        if (!target) {
            return;
        }

        if (
            target.kind === "variable"
            && options.isVariableRange(target)
        ) {
            return;
        }

        let text = "";

        if (target.kind === "data") {
            options.clearVariableMetadataClipboard();
            options.clearDataColumnClipboard();
            text = readDatasetCellRawValue(
                options.getDataCell(target)
            );
        }
        else {
            const variable = options.getVariable(target.rowIndex);

            if (!variable) {
                return;
            }

            options.clearDataColumnClipboard();
            text = options.makeVariableMetadataText(
                variable,
                target.key
            );
        }

        const copied = await options.writeClipboard(text);

        if (!copied) {
            options.showNotice(
                options.translate("Clipboard copy failed")
            );
        }
    };

    const pasteVariablePayload = async function(
        target: VariableTarget,
        payload: VariableMetadataClipboardPayload,
        targetRows: number[]
    ): Promise<void> {
        if (target.key !== payload.key) {
            options.showNotice(
                options.translate(
                    "Paste into the same metadata column"
                )
            );
            return;
        }

        if (payload.key === "values") {
            let changed = false;

            for (const rowIndex of targetRows) {
                const updated = await options.applyVariableValues(
                    rowIndex,
                    payload
                );
                changed = changed || updated;
            }

            if (!changed) {
                return;
            }

            if (targetRows.length > 1) {
                options.clearVariableRange();
            }

            options.renderVariables();
            await options.refreshDataset();
            options.showNotice(
                options.translate("Value labels updated")
            );
            return;
        }

        for (const rowIndex of targetRows) {
            const field = options.getVariableField(
                rowIndex,
                target.key
            );

            if (!field) {
                continue;
            }

            await options.applyVariableText(
                {
                    ...target,
                    rowIndex
                },
                field,
                payload.text
            );
        }

        if (targetRows.length > 1) {
            options.clearVariableRange();
        }

        options.renderVariables();
    };

    const pasteVariableText = async function(
        target: VariableTarget,
        text: string,
        targetRows: number[]
    ): Promise<void> {
        if (target.key === "values") {
            options.showNotice(
                options.translate(
                    "Copy value labels from another Values cell"
                )
            );
            return;
        }

        for (const rowIndex of targetRows) {
            const field = options.getVariableField(
                rowIndex,
                target.key
            );

            if (!field) {
                continue;
            }

            await options.applyVariableText(
                {
                    ...target,
                    rowIndex
                },
                field,
                text
            );
        }

        if (targetRows.length > 1) {
            options.clearVariableRange();
            options.renderVariables();
        }
    };

    const pasteTarget = async function(): Promise<void> {
        const target = options.getTarget();
        options.hideMenu();

        if (!target) {
            return;
        }

        const text = await options.readClipboard();

        if (target.kind === "data") {
            if (!target.row || !target.column) {
                return;
            }

            const updated = await options.updateDataCell(
                target.row,
                target.column,
                text
            );

            if (!updated) {
                options.showNotice(
                    options.translate("Cell update failed")
                );
                return;
            }

            options.replaceLoadedDataCell(
                target.row,
                target.column,
                updated
            );
            options.renderData();
            return;
        }

        const targetRows = options.getVariableRows(target);
        const metadataPayload =
            options.readVariableMetadata(text);

        if (metadataPayload) {
            await pasteVariablePayload(
                target,
                metadataPayload,
                targetRows
            );
            return;
        }

        await pasteVariableText(target, text, targetRows);
    };

    return {
        copyTarget,
        pasteTarget
    };
};

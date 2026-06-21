import type {
    DeclaredMissingUpdateRequest,
    CellUpdateRequest,
    TabularPreviewSnapshot,
    ValueLabelUpdateRequest,
    VariableMetadataSnapshot
} from "../../runtime/provider-contract/runtimeProvider";
import type { CopyPayload } from "../clipboard/copyPayload";
import {
    createCopyPayload,
    createVariableMetadataCopyPayload
} from "../clipboard/copyPayload";
import type { PastePayload } from "../clipboard/pastePayload";
import {
    createPasteCellUpdates,
    createVariableMetadataPasteUpdates,
    VariableMetadataPasteUpdate
} from "../clipboard/pasteMapping";
import type { DatasetEditorSelection } from "../state/datasetEditorState";


export interface DatasetPasteUpdatePlan {
    status: string;
    kind: string;
    cellUpdates: CellUpdateRequest[];
    metadataUpdates: VariableMetadataPasteUpdate[];
    valueLabelUpdates: ValueLabelUpdateRequest[];
    declaredMissingUpdates: DeclaredMissingUpdateRequest[];
    message: string;
}


const isVariableMetadataSelection = function(selection: DatasetEditorSelection): boolean {
    return selection.kind === "variable-cell" || selection.kind === "variable-row" || selection.kind === "metadata-range";
};


const createStructuredValuesPasteUpdates = function(
    metadata: VariableMetadataSnapshot | null | undefined,
    selection: DatasetEditorSelection,
    payload: PastePayload | null | undefined,
    sourceCopyPayload?: CopyPayload | null
): { valueLabelUpdates: ValueLabelUpdateRequest[]; declaredMissingUpdates: DeclaredMissingUpdateRequest[] } {
    if (
        !metadata
        || metadata.status !== "ready"
        || selection.kind !== "variable-cell"
        || selection.metadataKey !== "values"
        || !payload
        || payload.status !== "ready"
        || sourceCopyPayload?.kind !== "variable-values-and-labels"
    ) {
        return {
            valueLabelUpdates: [],
            declaredMissingUpdates: []
        };
    }

    const variable = metadata.variables[selection.rowIndex];

    if (!variable) {
        return {
            valueLabelUpdates: [],
            declaredMissingUpdates: []
        };
    }

    const labels: ValueLabelUpdateRequest["labels"] = [];
    const missing: DeclaredMissingUpdateRequest["values"] = [];

    payload.rows.forEach((row) => {
        const marker = String(row[2] ?? "").trim().toUpperCase();

        if (marker === "RANGE") {
            return;
        }

        const value = String(row[0] ?? "").trim();
        const label = String(row[1] ?? "").trim();

        if (!value) {
            return;
        }

        const entry = {
            value,
            label: label || value
        };

        labels.push(entry);

        if (marker === "TRUE") {
            missing.push(entry);
        }
    });

    return {
        valueLabelUpdates: labels.length > 0
            ? [{
                objectName: metadata.objectName,
                variableName: variable.name,
                labels,
                uiCommandVisibility: "hidden",
                visibleCommandText: ""
            }]
            : [],
        declaredMissingUpdates: missing.length > 0
            ? [{
                objectName: metadata.objectName,
                variableName: variable.name,
                values: missing,
                uiCommandVisibility: "hidden",
                visibleCommandText: ""
            }]
            : []
    };
};


export const createPastePayloadForSelection = function(
    selection: DatasetEditorSelection,
    payload: PastePayload | null | undefined,
    sourceCopyPayload?: CopyPayload | null
): PastePayload | null | undefined {
    if (
        selection.kind === "variable-cell"
        && selection.metadataKey === "values"
        && payload
        && payload.status === "ready"
        && sourceCopyPayload?.kind === "variable-values-and-labels"
    ) {
        const valueLabels = payload.rows.map((row) => {
            if (String(row[2] ?? "").trim().toUpperCase() === "RANGE") {
                return "";
            }

            const value = String(row[0] ?? "").trim();
            const label = String(row[1] ?? "").trim();

            return value ? value + " = " + (label || value) : "";
        }).filter(Boolean).join("; ");

        return {
            status: payload.status,
            rows: [[valueLabels]],
            width: 1,
            height: valueLabels ? 1 : 0,
            message: "Variable value-label clipboard payload normalized to metadata text."
        };
    }

    if (
        selection.kind !== "data-column"
        || !payload
        || payload.status !== "ready"
        || sourceCopyPayload?.kind !== "data-column-values-and-labels"
    ) {
        return payload;
    }

    return {
        status: payload.status,
        rows: payload.rows.map((row) => {
            return [String(row[0] ?? "")];
        }),
        width: payload.rows.length > 0 ? 1 : 0,
        height: payload.height,
        message: "Values-and-labels clipboard payload normalized to data-column values."
    };
};


export const createCopyPayloadFromSelection = function(
    preview: TabularPreviewSnapshot | null | undefined,
    metadata: VariableMetadataSnapshot | null | undefined,
    selection: DatasetEditorSelection,
    options?: { includeValueLabels?: boolean }
): CopyPayload {
    if (isVariableMetadataSelection(selection)) {
        return createVariableMetadataCopyPayload(metadata, selection);
    }

    return createCopyPayload(preview, selection, metadata, options);
};


export const createClipboardCopyPayloadFromSelection = function(
    preview: TabularPreviewSnapshot | null | undefined,
    metadata: VariableMetadataSnapshot | null | undefined,
    selection: DatasetEditorSelection,
    options?: { includeValueLabels?: boolean }
): CopyPayload {
    return createCopyPayloadFromSelection(preview, metadata, selection, {
        includeValueLabels: options?.includeValueLabels ?? selection.kind === "data-column"
    });
};


export const createPasteUpdatePlanFromSelection = function(
    preview: TabularPreviewSnapshot | null | undefined,
    metadata: VariableMetadataSnapshot | null | undefined,
    selection: DatasetEditorSelection,
    payload: PastePayload | null | undefined,
    sourceCopyPayload?: CopyPayload | null
): DatasetPasteUpdatePlan {
    const pastePayload = createPastePayloadForSelection(selection, payload, sourceCopyPayload);
    const cellUpdates = createPasteCellUpdates(preview, selection, pastePayload);

    if (cellUpdates.length > 0) {
        return {
            status: "ready",
            kind: "data-cells",
            cellUpdates,
            metadataUpdates: [],
            valueLabelUpdates: [],
            declaredMissingUpdates: [],
            message: "Paste updates are ready for the runtime write-cell contract."
        };
    }

    const structuredUpdates = createStructuredValuesPasteUpdates(metadata, selection, payload, sourceCopyPayload);

    if (structuredUpdates.valueLabelUpdates.length > 0 || structuredUpdates.declaredMissingUpdates.length > 0) {
        return {
            status: "ready",
            kind: "variable-values",
            cellUpdates: [],
            metadataUpdates: [],
            valueLabelUpdates: structuredUpdates.valueLabelUpdates,
            declaredMissingUpdates: structuredUpdates.declaredMissingUpdates,
            message: "Paste updates are ready for the runtime value-label and declared-missing contracts."
        };
    }

    const metadataUpdates = createVariableMetadataPasteUpdates(metadata, selection, pastePayload);

    if (metadataUpdates.length > 0) {
        return {
            status: "ready",
            kind: "variable-metadata",
            cellUpdates: [],
            metadataUpdates,
            valueLabelUpdates: [],
            declaredMissingUpdates: [],
            message: "Paste updates are ready for the runtime variable-metadata contract."
        };
    }

    return {
        status: "empty",
        kind: "none",
        cellUpdates: [],
        metadataUpdates: [],
        valueLabelUpdates: [],
        declaredMissingUpdates: [],
        message: "No paste updates are available for the current selection."
    };
};


export const clipboardCommandsApi = {
    createClipboardCopyPayloadFromSelection,
    createCopyPayloadFromSelection,
    createPastePayloadForSelection,
    createPasteUpdatePlanFromSelection
};

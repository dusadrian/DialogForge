import type {
    DatasetVariableColumnKey
} from "../clipboard/editorClipboardState";


export type VariableColumnWidths = Record<DatasetVariableColumnKey, number>;


export const DEFAULT_VARIABLE_COLUMN_WIDTHS: VariableColumnWidths = {
    name: 140,
    type: 116,
    width: 70,
    decimals: 78,
    label: 220,
    values: 108,
    align: 86,
    measure: 96
};


export const copyVariableColumnWidths = function(
    widths: VariableColumnWidths = DEFAULT_VARIABLE_COLUMN_WIDTHS
): VariableColumnWidths {
    return { ...widths };
};


export const applyStoredVariableColumnWidths = function(
    current: VariableColumnWidths,
    value: unknown
): VariableColumnWidths {
    const nextWidths = copyVariableColumnWidths(current);

    if (!value || typeof value !== "object") {
        return nextWidths;
    }

    (Object.keys(nextWidths) as DatasetVariableColumnKey[]).forEach((key) => {
        const next = Number((value as Record<string, unknown>)[key]);

        if (!Number.isFinite(next) || next < 40) {
            return;
        }

        nextWidths[key] = Math.round(next);
    });

    return nextWidths;
};

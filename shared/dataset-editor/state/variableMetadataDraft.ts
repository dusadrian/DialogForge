import {
    categoriesEqual,
    getMissingValuesFromCategories,
    getValueLabelCategories,
    missingRangeEqual,
    stringListsEqual,
    type DatasetVariableCategoryValue,
    type DatasetVariableMissingRangeValue
} from "../commands/visibleCommandText";


export interface VariableMetadataDraftValue {
    name: string;
    type: string;
    label: string;
    values: string;
    width: number;
    decimals: number;
    align: string;
    measure: string;
    calibrated?: boolean;
    declared?: boolean;
    categories?: DatasetVariableCategoryValue[];
    missingRange?: DatasetVariableMissingRangeValue | null;
}


export const cloneVariableCategory = function(
    category: DatasetVariableCategoryValue
): DatasetVariableCategoryValue {
    return {
        value: String(category?.value || ""),
        label: String(category?.label || ""),
        isMissing: category?.isMissing === true
    };
};


export const cloneMissingRange = function(
    range: DatasetVariableMissingRangeValue | null | undefined
): DatasetVariableMissingRangeValue | null {
    if (!range) return null;

    return {
        min: String(range.min || ""),
        max: String(range.max || "")
    };
};


export const cloneVariableMetadata = function<T extends VariableMetadataDraftValue>(
    entry: T | null | undefined
): T | null {
    if (!entry) return null;

    return {
        ...entry,
        categories: Array.isArray(entry.categories)
            ? entry.categories.map(cloneVariableCategory)
            : [],
        missingRange: cloneMissingRange(entry.missingRange)
    };
};


export const normalizeMissingRange = function(
    minimumValue: string,
    maximumValue: string
): DatasetVariableMissingRangeValue | null {
    const minimumText = String(minimumValue || "").trim();
    const maximumText = String(maximumValue || "").trim();

    if (!minimumText || !maximumText) return null;

    const minimum = Number(minimumText);
    const maximum = Number(maximumText);

    if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return null;

    return {
        min: String(Math.min(minimum, maximum)),
        max: String(Math.max(minimum, maximum))
    };
};


export const valueFallsWithinMissingRange = function(
    value: string,
    range: DatasetVariableMissingRangeValue | null | undefined
): boolean {
    if (!range) return false;

    const valueText = String(value || "").trim();
    const minimumText = String(range.min || "").trim();
    const maximumText = String(range.max || "").trim();

    if (!valueText || !minimumText || !maximumText) return false;

    const numericValue = Number(valueText);
    const minimum = Number(minimumText);
    const maximum = Number(maximumText);

    if (
        !Number.isFinite(numericValue) ||
        !Number.isFinite(minimum) ||
        !Number.isFinite(maximum)
    ) {
        return false;
    }

    return numericValue >= Math.min(minimum, maximum)
        && numericValue <= Math.max(minimum, maximum);
};


export const valueLabelDraftChanged = function(
    original: VariableMetadataDraftValue,
    draft: VariableMetadataDraftValue
): boolean {
    const originalCategories = getValueLabelCategories(original);
    const draftCategories = getValueLabelCategories(draft);
    const originalMissingValues = getMissingValuesFromCategories(original);
    const draftMissingValues = getMissingValuesFromCategories(draft);

    return !categoriesEqual(originalCategories, draftCategories)
        || !stringListsEqual(originalMissingValues, draftMissingValues)
        || !missingRangeEqual(
            cloneMissingRange(original.missingRange),
            cloneMissingRange(draft.missingRange)
        );
};

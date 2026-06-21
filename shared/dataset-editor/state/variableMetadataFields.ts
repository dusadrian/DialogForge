export type VariableMetadataFieldKey =
    | "name"
    | "type"
    | "width"
    | "decimals"
    | "label"
    | "values"
    | "align"
    | "measure";


export type VariableMetadataFieldValue = Record<VariableMetadataFieldKey, string | number>;


export type PersistedVariableMetadataField =
    | "type"
    | "label"
    | "width"
    | "decimals"
    | "align";


export type CommandVariableMetadataField = "measure";


export const readVariableMetadataField = function<
    T extends VariableMetadataFieldValue,
    K extends VariableMetadataFieldKey
>(
    entry: T,
    key: K
): T[K] {
    return entry[key];
};


export const writeVariableMetadataField = function<
    T extends VariableMetadataFieldValue
>(
    entry: T,
    key: VariableMetadataFieldKey,
    value: string | number
): void {
    if (key === "width" || key === "decimals") {
        entry[key] = Math.max(0, Number(value || 0));
        return;
    }

    entry[key] = String(value || "");
};


export const isPersistedVariableMetadataField = function(
    key: VariableMetadataFieldKey
): key is PersistedVariableMetadataField {
    return key === "type" ||
        key === "label" ||
        key === "width" ||
        key === "decimals" ||
        key === "align";
};


export const isCommandVariableMetadataField = function(
    key: VariableMetadataFieldKey
): key is CommandVariableMetadataField {
    return key === "measure";
};

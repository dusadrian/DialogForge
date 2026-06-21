export interface DatasetVariableCategoryValue {
    value: string;
    label: string;
    isMissing: boolean;
}


export interface DatasetVariableMissingRangeValue {
    min: string;
    max: string;
}


export interface DatasetVariableCommandMetadata {
    name: string;
    type: string;
    label: string;
    width: number;
    decimals: number;
    align: string;
    measure: string;
    declared?: boolean;
    categories?: DatasetVariableCategoryValue[];
    missingRange?: DatasetVariableMissingRangeValue | null;
}


const escapeRString = function(value: string): string {
    return String(value || "")
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');
};


export const asRObjectReference = function(value: string): string {
    const name = String(value || "").trim();

    if (!name) return "";

    if (/^[A-Za-z.][A-Za-z0-9._]*$/.test(name) && !/^\.[0-9]/.test(name)) {
        return name;
    }

    return `\`${name.replace(/`/g, "\\\`")}\``;
};


export const asRStringLiteral = function(value: string): string {
    return `"${escapeRString(value)}"`;
};


const serializeVariableValue = function(value: string, variableType: string): string {
    const raw = String(value || "");
    const type = String(variableType || "").trim();

    if (type === "logical") {
        const token = raw.trim().toLowerCase();

        if (token === "true" || token === "t" || token === "1") return "TRUE";
        if (token === "false" || token === "f" || token === "0") return "FALSE";
        if (token === "na") return "NA";

        return asRStringLiteral(raw);
    }

    if (
        (type === "numeric" || type === "integer") &&
        /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(raw.trim())
    ) {
        return raw.trim();
    }

    return asRStringLiteral(raw);
};


const uniqueStrings = function(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    values.forEach((value) => {
        const normalized = String(value || "");

        if (seen.has(normalized)) return;

        seen.add(normalized);
        result.push(normalized);
    });

    return result;
};


const cloneCategory = function(
    category: DatasetVariableCategoryValue
): DatasetVariableCategoryValue {
    return {
        value: String(category?.value || ""),
        label: String(category?.label || ""),
        isMissing: Boolean(category?.isMissing)
    };
};


const cloneMissingRange = function(
    range: DatasetVariableMissingRangeValue | null | undefined
): DatasetVariableMissingRangeValue | null {
    if (!range) return null;

    return {
        min: String(range.min || ""),
        max: String(range.max || "")
    };
};


export const getValueLabelCategories = function(
    entry: DatasetVariableCommandMetadata | null | undefined
): DatasetVariableCategoryValue[] {
    if (!Array.isArray(entry?.categories)) return [];

    return entry.categories.map(cloneCategory);
};


export const getMissingValuesFromCategories = function(
    entry: DatasetVariableCommandMetadata | null | undefined
): string[] {
    const values = getValueLabelCategories(entry)
        .filter((category) => category.isMissing)
        .map((category) => category.value);

    return uniqueStrings(values);
};


export const categoriesEqual = function(
    left: DatasetVariableCategoryValue[],
    right: DatasetVariableCategoryValue[]
): boolean {
    if (left.length !== right.length) return false;

    return left.every((category, index) => {
        const candidate = right[index];

        return String(category?.value || "") === String(candidate?.value || "")
            && String(category?.label || "") === String(candidate?.label || "")
            && Boolean(category?.isMissing) === Boolean(candidate?.isMissing);
    });
};


export const stringListsEqual = function(left: string[], right: string[]): boolean {
    if (left.length !== right.length) return false;

    return left.every((value, index) => {
        return String(value || "") === String(right[index] || "");
    });
};


export const missingRangeEqual = function(
    left: DatasetVariableMissingRangeValue | null | undefined,
    right: DatasetVariableMissingRangeValue | null | undefined
): boolean {
    return String(left?.min || "") === String(right?.min || "")
        && String(left?.max || "") === String(right?.max || "");
};


const labelsVector = function(
    categories: DatasetVariableCategoryValue[],
    variableType: string
): string {
    const entries = categories.map((category) => {
        return `${asRStringLiteral(category.label)} = ${serializeVariableValue(
            category.value,
            variableType
        )}`;
    });

    return `c(${entries.join(", ")})`;
};


const valuesVector = function(values: string[], variableType: string): string {
    const entries = values.map((value) => {
        return serializeVariableValue(value, variableType);
    });

    return `c(${entries.join(", ")})`;
};


const variableBaseType = function(
    entry: DatasetVariableCommandMetadata | null | undefined
): string {
    const tokens = String(entry?.type || "")
        .split("/")
        .map((token) => token.trim())
        .filter(Boolean);

    for (const type of ["Date", "logical", "integer", "numeric", "character"]) {
        if (tokens.indexOf(type) >= 0) return type;
    }

    return tokens[tokens.length - 1] || "character";
};


const typeCoercionCommand = function(variable: string, targetType: string): string {
    if (targetType === "numeric") {
        return `${variable} <- suppressWarnings(as.numeric(${variable}))`;
    }

    if (targetType === "integer") {
        return `${variable} <- suppressWarnings(as.integer(${variable}))`;
    }

    if (targetType === "logical") return `${variable} <- as.logical(${variable})`;

    if (targetType === "Date") {
        return `${variable} <- as.Date(${variable}, origin = "1970-01-01")`;
    }

    return `${variable} <- as.character(${variable})`;
};


const insideCommand = function(datasetName: string, statements: string[]): string {
    return [
        "inside(",
        `  ${asRObjectReference(datasetName)},`,
        `  ${statements.join(";\n  ")}`,
        ")"
    ].join("\n");
};


export const buildVariableMetadataCommand = function(
    datasetName: string,
    original: DatasetVariableCommandMetadata | null | undefined,
    updated: DatasetVariableCommandMetadata | null | undefined
): string {
    const variableName = String(updated?.name || original?.name || "").trim();

    if (!datasetName || !variableName || !updated) return "";

    const variable = asRObjectReference(variableName);
    const originalType = variableBaseType(original);
    const updatedType = variableBaseType(updated);
    const originalCategories = getValueLabelCategories(original);
    const updatedCategories = getValueLabelCategories(updated);
    const originalMissingValues = getMissingValuesFromCategories(original);
    const updatedMissingValues = getMissingValuesFromCategories(updated);
    const originalRange = cloneMissingRange(original?.missingRange);
    const updatedRange = cloneMissingRange(updated?.missingRange);
    const statements: string[] = [];

    if (originalType !== updatedType) {
        if (original?.declared) {
            statements.push(`${variable} <- declared::undeclare(${variable}, drop = TRUE)`);
        }

        statements.push(typeCoercionCommand(variable, updatedType));
    }

    if (String(original?.label || "") !== String(updated.label || "")) {
        statements.push(
            `attr(${variable}, "label") <- ${updated.label
                ? asRStringLiteral(updated.label)
                : "NULL"}`
        );
    }

    if (String(original?.measure || "") !== String(updated.measure || "")) {
        statements.push(
            `attr(${variable}, "measurement") <- ${updated.measure
                ? asRStringLiteral(updated.measure)
                : "NULL"}`
        );
    }

    if (Number(original?.width ?? 0) !== Number(updated.width ?? 0)) {
        statements.push(
            `attr(${variable}, "width") <- ${Number(updated.width) > 0
                ? String(Math.round(Number(updated.width)))
                : "NULL"}`
        );
    }

    if (Number(original?.decimals ?? 0) !== Number(updated.decimals ?? 0)) {
        statements.push(
            `attr(${variable}, "decimals") <- ${Number(updated.decimals) > 0
                ? String(Math.round(Number(updated.decimals)))
                : "NULL"}`
        );
    }

    if (String(original?.align || "") !== String(updated.align || "")) {
        statements.push(
            `attr(${variable}, "align") <- ${updated.align
                ? asRStringLiteral(updated.align)
                : "NULL"}`
        );
    }

    if (!categoriesEqual(originalCategories, updatedCategories)) {
        statements.push(
            `attr(${variable}, "labels") <- ${updatedCategories.length
                ? labelsVector(updatedCategories, updatedType)
                : "NULL"}`
        );
    }

    if (!stringListsEqual(originalMissingValues, updatedMissingValues)) {
        statements.push(
            `attr(${variable}, "na_values") <- ${updatedMissingValues.length
                ? valuesVector(updatedMissingValues, updatedType)
                : "NULL"}`
        );
    }

    if (!missingRangeEqual(originalRange, updatedRange)) {
        const hasRange = updatedRange
            && updatedRange.min.length > 0
            && updatedRange.max.length > 0;
        statements.push(
            `attr(${variable}, "na_range") <- ${hasRange
                ? valuesVector([updatedRange.min, updatedRange.max], updatedType)
                : "NULL"}`
        );
    }

    const requiresDeclared = Boolean(
        String(updated.label || "").trim()
        || String(updated.measure || "").trim()
        || updatedCategories.length
        || updatedMissingValues.length
        || updatedRange
        || updated.declared
    );

    if (requiresDeclared && !original?.declared) {
        statements.push(`${variable} <- declared::as.declared(${variable})`);
    }

    return statements.length ? insideCommand(datasetName, statements) : "";
};

export interface DatasetCellTextValue {
    display?: string;
    raw?: string;
    declaredMissing?: boolean;
}


export interface DatasetCellValueLabelMetadata {
    categories?: Array<{
        value: string;
        label: string;
    }>;
}


const numericCellPattern = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;


const variableTypeTokens = function(variableType: string): string[] {
    return String(variableType || "")
        .trim()
        .toLowerCase()
        .split(/[\/|,]/g)
        .map((token) => token.trim())
        .filter(Boolean);
};


const normalizedDecimals = function(value: number | undefined): number {
    const decimals = Number(value);

    if (!Number.isFinite(decimals)) return 0;

    return Math.max(0, Math.min(8, Math.round(decimals)));
};


export const readDatasetCellRawValue = function(
    cell: DatasetCellTextValue | null | undefined
): string {
    if (!cell) {
        return "";
    }

    if (cell.raw !== undefined && cell.raw !== null) {
        return String(cell.raw);
    }

    return String(cell.display ?? "");
};


export const readDatasetCellValueLabel = function(
    cell: DatasetCellTextValue | null | undefined,
    metadata: DatasetCellValueLabelMetadata | null | undefined
): string {
    const categories = Array.isArray(metadata?.categories)
        ? metadata.categories
        : [];
    const rawValue = readDatasetCellRawValue(cell);
    const match = categories.find((category) => {
        return String(category?.value ?? "") === rawValue;
    });

    if (match) {
        return String(match.label || match.value || "");
    }

    const display = String(cell?.display ?? "");

    return display || rawValue;
};


export const formatDatasetCellText = function(
    cell: DatasetCellTextValue,
    variableType: string,
    variableDecimals?: number
): string {
    const display = String(cell?.display ?? "");

    if (cell?.declaredMissing) return display;

    const typeTokens = variableTypeTokens(variableType);
    const isDoubleNumeric = typeTokens.indexOf("numeric") >= 0
        && typeTokens.indexOf("integer") < 0;

    if (!isDoubleNumeric) return display;

    const raw = String(cell?.raw ?? "").trim();
    const source = raw || display.trim();

    if (!source || !numericCellPattern.test(source)) return display;

    const number = Number(source);

    if (!Number.isFinite(number)) return display;

    const decimals = normalizedDecimals(variableDecimals);

    if (decimals === 0) return String(Math.round(number));

    const formatted = number.toFixed(decimals);
    const negativeZero = `-0.${"0".repeat(decimals)}`;

    return formatted === negativeZero
        ? `0.${"0".repeat(decimals)}`
        : formatted;
};

export const coerceRuntimeCellValue = function(
    value: unknown,
    columnType: string
): unknown {
    if (typeof value !== "string") {
        return value;
    }

    if (/numeric|integer|double|number/i.test(columnType)) {
        const numberValue = Number(value);

        if (Number.isFinite(numberValue)) {
            return numberValue;
        }
    }

    return value;
};


export const optionalRuntimeNumber = function(
    value: unknown
): number | undefined {
    const numberValue = Number(value);

    return Number.isFinite(numberValue) ? numberValue : undefined;
};

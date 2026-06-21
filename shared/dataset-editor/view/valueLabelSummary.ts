export interface DatasetValueLabelSummaryEntry {
    values?: string;
    categories?: Array<{
        value?: string;
        label?: string;
    }>;
    missingRange?: {
        min?: string;
        max?: string;
    } | null;
}


export const summarizeDatasetValueLabels = function(
    entry: DatasetValueLabelSummaryEntry | null | undefined,
    translate: (key: string) => string
): string {
    const categories = Array.isArray(entry?.categories)
        ? entry.categories
        : [];

    if (categories.length) {
        const preview = categories
            .slice(0, 2)
            .map((category) => {
                return String(category.label || category.value || "").trim();
            })
            .filter(Boolean);

        if (preview.length) {
            return preview.join(", ");
        }
    }

    if (entry?.missingRange?.min && entry?.missingRange?.max) {
        return `${translate("range")} ${entry.missingRange.min}:${entry.missingRange.max}`;
    }

    return String(entry?.values || "");
};

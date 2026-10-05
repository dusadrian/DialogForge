import type { DatasetVariableMetadataBatch } from "./datasetViewerTypes";


export const isDatasetVariableMetadataBatch = function(
    value: unknown,
    datasetName: string,
    start: number,
    count: number
): boolean {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    const batch = value as DatasetVariableMetadataBatch;
    if (
        !Array.isArray(batch.items)
        || batch.name !== datasetName
        || !Number.isSafeInteger(batch.total)
        || batch.total < 0
        || batch.start !== start
        || !Number.isSafeInteger(batch.count)
        || batch.count < 0
        || batch.count !== batch.items.length
        || batch.count > count
        || (batch.count > 0 && start - 1 + batch.count > batch.total)
        || (batch.count === 0 && start - 1 < batch.total)
    ) {
        return false;
    }

    return batch.items.every((item) => {
        return Boolean(item)
            && typeof item === "object"
            && !Array.isArray(item)
            && typeof item.name === "string"
            && Boolean(item.name.trim());
    });
};


export const canFallbackVariableMetadataBatch = function(status: string): boolean {
    return status === "unavailable" || status === "unsupported";
};

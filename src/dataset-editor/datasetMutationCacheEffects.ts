export interface DatasetMutationCacheEffect {
    previewChanged: boolean;
    variableMetadataChanged: boolean;
    variableMetadataPatched: boolean;
    warmVariableMetadata?: boolean;
}


export interface DatasetMutationCache {
    invalidatePreview(objectName: string): void;
    invalidateVariableMetadata(objectName: string): void;
    warmVariableMetadata(objectName: string): void;
}


export const createDatasetMutationCacheEffect = function(
    changes: Array<Record<string, unknown>>,
    variableMetadataPatched = false
): DatasetMutationCacheEffect {
    const variableMetadataChanged = changes.some((change) => {
        return change.schemaChanged === true
            || (change.kind !== "dataset_cells_changed"
                && change.kind !== "dataset_rows_changed");
    });

    return {
        previewChanged: changes.length > 0,
        variableMetadataChanged,
        variableMetadataPatched,
        warmVariableMetadata: true
    };
};


export const applyDatasetMutationCacheEffects = function(
    cache: DatasetMutationCache | null | undefined,
    objectName: string,
    effect: DatasetMutationCacheEffect
): void {
    if (effect.previewChanged) {
        cache?.invalidatePreview(objectName);
    }

    if (!effect.variableMetadataChanged || effect.variableMetadataPatched) {
        return;
    }

    cache?.invalidateVariableMetadata(objectName);
    if (effect.warmVariableMetadata) {
        cache?.warmVariableMetadata(objectName);
    }
};

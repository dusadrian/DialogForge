import type {
    WorkspaceUpdate
} from "../provider-contract/runtimeProvider";


export interface WorkspaceDatasetCacheEffect {
    name: string;
    preview: boolean;
    variableMetadata: boolean;
    variableMetadataStructure: boolean;
    variableNames: string[];
    removed: boolean;
    copiedFrom: string;
}


export interface WorkspaceDatasetCache {
    copy(sourceName: string, targetName: string): void;
    invalidatePreview(objectName: string): void;
    invalidateVariableMetadata(objectName: string): void;
    refreshVariableMetadata(objectName: string, variableNames: string[]): Promise<unknown>;
}


export const readWorkspaceDatasetWarmup = function(
    effects: readonly WorkspaceDatasetCacheEffect[],
    datasetName: string
): { preview: boolean; variableMetadata: boolean } {
    const effect = effects.find(function(candidate) {
        return candidate.name === datasetName && !candidate.removed;
    });

    return {
        preview: Boolean(effect?.preview),
        variableMetadata: Boolean(
            effect?.variableMetadata
            && (
                effect.variableMetadataStructure
                || effect.variableNames.length === 0
            )
        )
    };
};


export const applyWorkspaceDatasetCacheEffects = function(
    effects: readonly WorkspaceDatasetCacheEffect[],
    cache: WorkspaceDatasetCache | null | undefined,
    invalidateHostDataset?: (objectName: string) => void
): Promise<unknown>[] {
    const metadataRefreshes: Promise<unknown>[] = [];

    for (const effect of effects) {
        invalidateHostDataset?.(effect.name);
        if (effect.copiedFrom) {
            cache?.copy(effect.copiedFrom, effect.name);
            continue;
        }

        if (effect.preview) {
            cache?.invalidatePreview(effect.name);
        }

        if (!effect.variableMetadata) {
            continue;
        }

        if (
            !effect.variableMetadataStructure
            && effect.variableNames.length > 0
        ) {
            if (cache) {
                metadataRefreshes.push(cache.refreshVariableMetadata(effect.name, effect.variableNames));
            }
        }
        else {
            cache?.invalidateVariableMetadata(effect.name);
        }
    }

    return metadataRefreshes;
};


export const warmWorkspaceDatasetCacheEffects = function(
    effects: readonly WorkspaceDatasetCacheEffect[],
    datasetName: string,
    cache: {
        warmPreview(objectName: string): void;
        warmVariableMetadata(objectName: string): void;
    } | null | undefined
): void {
    const warmup = readWorkspaceDatasetWarmup(effects, datasetName);

    if (warmup.preview) {
        cache?.warmPreview(datasetName);
    }
    if (warmup.variableMetadata) {
        cache?.warmVariableMetadata(datasetName);
    }
};


const ensureEffect = function(
    effects: Map<string, WorkspaceDatasetCacheEffect>,
    name: string
): WorkspaceDatasetCacheEffect | null {
    const cleanName = String(name || "").trim();

    if (!cleanName) {
        return null;
    }

    let effect = effects.get(cleanName);

    if (!effect) {
        effect = {
            name: cleanName,
            preview: false,
            variableMetadata: false,
            variableMetadataStructure: false,
            variableNames: [],
            removed: false,
            copiedFrom: ""
        };
        effects.set(cleanName, effect);
    }

    return effect;
};


export const createWorkspaceDatasetCacheEffects = function(
    update: WorkspaceUpdate
): WorkspaceDatasetCacheEffect[] {
    const effects = new Map<string, WorkspaceDatasetCacheEffect>();

    update.datasets.copied.forEach(function(copy) {
        const effect = ensureEffect(effects, copy.target);

        if (effect) {
            effect.copiedFrom = copy.source;
        }
    });

    update.datasets.added.forEach(function(name) {
        const effect = ensureEffect(effects, name);

        if (effect) {
            effect.preview = true;
            effect.variableMetadata = true;
            effect.variableMetadataStructure = true;
        }
    });

    update.datasets.removed.forEach(function(name) {
        const effect = ensureEffect(effects, name);

        if (effect) {
            effect.preview = true;
            effect.variableMetadata = true;
            effect.variableMetadataStructure = true;
            effect.removed = true;
        }
    });

    update.datasets.changed.forEach(function(change) {
        const effect = ensureEffect(effects, change.name);

        if (!effect) {
            return;
        }

        if (
            change.kind === "dataset_cells_changed"
            || change.kind === "dataset_rows_changed"
        ) {
            effect.preview = true;
            return;
        }

        if (change.kind === "dataset_variable_meta_changed") {
            effect.variableMetadata = true;
            effect.variableNames = Array.from(new Set(
                effect.variableNames.concat(change.columns || [])
            ));
            return;
        }

        effect.preview = true;
        effect.variableMetadata = true;
        effect.variableMetadataStructure = true;
    });

    return Array.from(effects.values());
};


export const prepareWorkspaceDatasetCacheEffects = function(
    update: WorkspaceUpdate,
    cache: WorkspaceDatasetCache | null | undefined
) {
    const effects = createWorkspaceDatasetCacheEffects(update);
    const metadataRefreshes = Promise.allSettled(
        applyWorkspaceDatasetCacheEffects(effects, cache)
    );

    return { effects, metadataRefreshes };
};


export const workspaceUpdateChangesDialogVariables = function(
    effects: WorkspaceDatasetCacheEffect[]
): boolean {
    return effects.some(function(effect) {
        return effect.variableMetadata || effect.removed;
    });
};

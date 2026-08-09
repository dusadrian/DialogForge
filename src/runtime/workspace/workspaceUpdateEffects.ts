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
}


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
            removed: false
        };
        effects.set(cleanName, effect);
    }

    return effect;
};


export const createWorkspaceDatasetCacheEffects = function(
    update: WorkspaceUpdate
): WorkspaceDatasetCacheEffect[] {
    const effects = new Map<string, WorkspaceDatasetCacheEffect>();

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


export const workspaceUpdateChangesDialogVariables = function(
    effects: WorkspaceDatasetCacheEffect[]
): boolean {
    return effects.some(function(effect) {
        return effect.variableMetadata || effect.removed;
    });
};

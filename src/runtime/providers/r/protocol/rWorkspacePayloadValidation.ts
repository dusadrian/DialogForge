import {
    readWorkspaceObjectNameValue
} from "../../../workspace/workspaceUpdate";


export const hasValidRWorkspaceRevision = function(value: unknown): boolean {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const revision = value as Record<string, unknown>;

    return typeof revision.session === "string"
        && revision.session.trim().length > 0
        && typeof revision.sequence === "number"
        && Number.isSafeInteger(revision.sequence)
        && revision.sequence > 0;
};


export const hasValidRWorkspaceObjectList = function(value: unknown): boolean {
    return Array.isArray(value) && value.every(function(entry): boolean {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return false;
        }
        const variable = entry as Record<string, unknown>;
        const name = readWorkspaceObjectNameValue(variable);

        return typeof name === "string" && name.trim().length > 0;
    });
};


export const hasValidRWorkspaceReconciliationPayload = function(value: unknown): boolean {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const payload = value as Record<string, unknown>;
    const count = payload.objectCount;
    const rawDatasets = payload.datasets;
    if (!rawDatasets || typeof rawDatasets !== "object" || Array.isArray(rawDatasets)) {
        return false;
    }
    const datasets = rawDatasets as Record<string, unknown>;
    const nameLists = [payload.removed, datasets.added, datasets.removed];

    if (
        !hasValidRWorkspaceRevision(payload.workspaceRevision)
        || typeof count !== "number"
        || !Number.isSafeInteger(count)
        || count < 0
        || !hasValidRWorkspaceObjectList(payload.added)
        || !hasValidRWorkspaceObjectList(payload.updated)
        || !nameLists.every(list => Array.isArray(list) && list.every(
            name => typeof name === "string" && name.trim().length > 0
        ))
        || !Array.isArray(datasets.changed)
        || !Array.isArray(datasets.copied)
    ) {
        return false;
    }

    return datasets.changed.every(function(entry): boolean {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return false;
        }
        const change = entry as Record<string, unknown>;

        return typeof change.name === "string" && change.name.trim().length > 0
            && typeof change.kind === "string" && change.kind.trim().length > 0;
    }) && datasets.copied.every(function(entry): boolean {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return false;
        }
        const copy = entry as Record<string, unknown>;

        return typeof copy.source === "string" && copy.source.trim().length > 0
            && typeof copy.target === "string" && copy.target.trim().length > 0;
    });
};

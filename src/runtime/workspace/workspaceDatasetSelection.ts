export interface WorkspaceDatasetCandidate {
    name?: unknown;
    kind?: unknown;
    display_type?: unknown;
    type_info?: unknown;
    capabilities?: unknown;
}


export const isWorkspaceDatasetCandidate = function(value: unknown): boolean {
    if (!value || typeof value !== "object") {
        return false;
    }

    const object = value as WorkspaceDatasetCandidate;
    const kind = String(
        object.kind || object.display_type || object.type_info || ""
    ).trim().toLowerCase();
    const capabilities = Array.isArray(object.capabilities)
        ? object.capabilities
        : [];

    return capabilities.includes("tabular.read")
        || kind === "table"
        || kind === "data.frame"
        || kind === "tibble";
};


export const readLatestAddedWorkspaceDataset = function(
    objects: readonly WorkspaceDatasetCandidate[],
    addedNames: readonly string[]
): string {
    const availableNames = new Set(objects
        .filter(isWorkspaceDatasetCandidate)
        .map((object) => String(object.name || "")));
    let latestDataset = "";

    for (const name of addedNames) {
        if (availableNames.has(name)) {
            latestDataset = name;
        }
    }

    return latestDataset;
};

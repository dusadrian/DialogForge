export interface WorkspaceDatasetEditorDocumentState {
    getDataEditorDatasetName(): string;
    setDataEditorDatasetName(name: string): void;
    getActiveDatasetName(): string;
    setActiveDataset(name: string): void;
    clearActiveDataset(): void;
}

export interface WorkspaceDatasetEditorDocument {
    objectName: string;
    message: string;
}

const readInput = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
};

const normalizeName = function(value: unknown): string {
    return String(value || "").trim();
};

export const readWorkspaceDatasetEditorDocumentName = function(
    state: Pick<
        WorkspaceDatasetEditorDocumentState,
        "getDataEditorDatasetName" | "getActiveDatasetName"
    >
): string {
    return state.getDataEditorDatasetName() || state.getActiveDatasetName() || "";
};

export const createWorkspaceDatasetEditorDocument = function(
    state: Pick<
        WorkspaceDatasetEditorDocumentState,
        "getDataEditorDatasetName" | "getActiveDatasetName"
    >
): WorkspaceDatasetEditorDocument {
    return {
        objectName: readWorkspaceDatasetEditorDocumentName(state),
        message: ""
    };
};

export const openWorkspaceDatasetEditorDocument = function(
    state: WorkspaceDatasetEditorDocumentState,
    value: unknown,
    args: unknown[]
): WorkspaceDatasetEditorDocument {
    const input = readInput(value);
    const datasetName = normalizeName(args?.[0] || input.name || value);

    if (datasetName) {
        state.setDataEditorDatasetName(datasetName);
        state.setActiveDataset(datasetName);
    }

    return createWorkspaceDatasetEditorDocument(state);
};

export const readWorkspaceActiveDatasetName = function(
    state: Pick<WorkspaceDatasetEditorDocumentState, "getActiveDatasetName">
): string {
    return state.getActiveDatasetName();
};

export const setWorkspaceActiveDatasetName = function(
    state: Pick<
        WorkspaceDatasetEditorDocumentState,
        "getActiveDatasetName" | "setActiveDataset"
    >,
    value: unknown,
    args: unknown[]
): string {
    const input = readInput(value);
    const datasetName = normalizeName(input.name || args?.[0]);

    if (datasetName) {
        state.setActiveDataset(datasetName);
    }

    return state.getActiveDatasetName();
};

export const clearWorkspaceActiveDatasetName = function(
    state: Pick<WorkspaceDatasetEditorDocumentState, "clearActiveDataset">
): string {
    state.clearActiveDataset();

    return "";
};

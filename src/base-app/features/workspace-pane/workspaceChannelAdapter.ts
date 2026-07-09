import {
    clearWorkspaceActiveDatasetName,
    createWorkspaceDatasetEditorDocument,
    openWorkspaceDatasetEditorDocument,
    readWorkspaceActiveDatasetName,
    setWorkspaceActiveDatasetName,
    type WorkspaceDatasetEditorDocument,
    type WorkspaceDatasetEditorDocumentState
} from "./workspaceDatasetEditorDocument";


export interface WorkspaceChannelAdapterBindings {
    getDataEditorDatasetName(): string;
    setDataEditorDatasetName(name: string): void;
    getActiveDatasetName(): string;
    setActiveDataset(name: string): void;
    clearActiveDataset(): void;
}

export interface WorkspaceChannelAdapter {
    getDatasetEditorDocument(): WorkspaceDatasetEditorDocument;
    openDatasetEditor(input: unknown, args: unknown[]): WorkspaceDatasetEditorDocument;
    getActiveDataset(): string;
    setActiveDataset(input: unknown, args: unknown[]): string;
    clearActiveDataset(): string;
}

export const createWorkspaceChannelAdapter = function(
    bindings: WorkspaceChannelAdapterBindings
): WorkspaceChannelAdapter {
    const state = bindings as WorkspaceDatasetEditorDocumentState;

    return {
        getDatasetEditorDocument() {
            return createWorkspaceDatasetEditorDocument(state);
        },

        openDatasetEditor(value, args) {
            return openWorkspaceDatasetEditorDocument(state, value, args);
        },

        getActiveDataset() {
            return readWorkspaceActiveDatasetName(state);
        },

        setActiveDataset(value, args) {
            return setWorkspaceActiveDatasetName(state, value, args);
        },

        clearActiveDataset() {
            return clearWorkspaceActiveDatasetName(state);
        }
    };
};

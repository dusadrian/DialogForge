import type {
    DatasetEditorUiBindings
} from "./datasetEditorUiBindings";


export type DatasetEditorControlBindings = Omit<
    DatasetEditorUiBindings,
    "document" | "contextMenus" | "globalEvents" | "dismissal"
>;


export interface DatasetEditorControlBindingOptions {
    rowHeight: number;
    getActiveTab(): "data" | "variables";
    setActiveTab(tab: "data" | "variables"): void;
    getCurrentDatasetName(): string;
    loadDataset(datasetName: string): void | Promise<unknown>;
    markDataViewportActivity(): void;
    queueViewportRefresh(): void;
    isVariableMetadataLoaded(): boolean;
    getVariableCount(): number;
    loadVariablesThroughRow(rowIndex: number): void | Promise<unknown>;
    isValueLabelsEditorOpen(): boolean;
    cancelValueLabelsEditor(): void;
    saveValueLabelsEditor(): void | Promise<unknown>;
}


export const createDatasetEditorControlBindingController = function(
    options: DatasetEditorControlBindingOptions
): DatasetEditorControlBindings {
    return {
        rowHeight: options.rowHeight,
        getActiveTab: options.getActiveTab,
        setActiveTab: options.setActiveTab,
        getCurrentDatasetName: options.getCurrentDatasetName,
        loadDataset: (datasetName) => {
            void options.loadDataset(datasetName);
        },
        markDataViewportActivity: options.markDataViewportActivity,
        queueViewportRefresh: options.queueViewportRefresh,
        isVariableMetadataLoaded: options.isVariableMetadataLoaded,
        getVariableCount: options.getVariableCount,
        loadVariablesThroughRow: (rowIndex) => {
            void options.loadVariablesThroughRow(rowIndex);
        },
        isValueLabelsEditorOpen: options.isValueLabelsEditorOpen,
        cancelValueLabelsEditor: options.cancelValueLabelsEditor,
        saveValueLabelsEditor: () => {
            void options.saveValueLabelsEditor();
        }
    };
};

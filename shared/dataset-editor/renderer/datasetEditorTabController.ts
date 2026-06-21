import type {
    DatasetEditorTab
} from "./datasetEditorChromeView";


export interface DatasetEditorTabController {
    readonly activeTab: DatasetEditorTab;
    isDataActive(): boolean;
    isVariablesActive(): boolean;
    setActiveTab(tab: DatasetEditorTab): void;
}


export const createDatasetEditorTabController = function(
    renderActiveTab: (tab: DatasetEditorTab) => void
): DatasetEditorTabController {
    let activeTab: DatasetEditorTab = "data";

    return {
        get activeTab(): DatasetEditorTab {
            return activeTab;
        },
        isDataActive: function(): boolean {
            return activeTab === "data";
        },
        isVariablesActive: function(): boolean {
            return activeTab === "variables";
        },
        setActiveTab: function(tab): void {
            activeTab = tab;
            renderActiveTab(tab);
        }
    };
};

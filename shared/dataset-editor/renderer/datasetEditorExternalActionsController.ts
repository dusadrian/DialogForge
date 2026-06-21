import {
    bindDatasetEditorIpc,
    type DatasetEditorIpcBridge,
    type DatasetEditorInitMessage,
    type DatasetEditorLanguageMessage
} from "./datasetEditorIpcBindings";


export interface DatasetEditorExternalActionsOptions {
    initialize(payload: DatasetEditorInitMessage): void;
    changeLanguage(payload: DatasetEditorLanguageMessage): void;
    setDatasetList(datasetNames: string[]): void;
    getCurrentDatasetName(): string;
    loadDataset(datasetName: string): Promise<void>;
    refreshDataset(datasetName: string): Promise<void>;
    applyFilterStateChanged(payload: unknown): void;
    applyDatasetChanges(changes: unknown): Promise<void>;
    jumpToCase(caseNumber: unknown): void;
    jumpToVariable(variableName: string): void;
}


export interface DatasetEditorExternalActionsController {
    bindIpc(bridge: DatasetEditorIpcBridge): void;
    openDataset(datasetName: string): void;
    refreshDataset(datasetName: string): void;
    goToCase(datasetName: string, caseNumber: unknown): void;
    goToVariable(datasetName: string, variableName: string): void;
}


export const createDatasetEditorExternalActionsController = function(
    options: DatasetEditorExternalActionsOptions
): DatasetEditorExternalActionsController {
    const openDataset = function(datasetName: string): void {
        void options.loadDataset(datasetName);
    };

    const refreshDataset = function(datasetName: string): void {
        void options.refreshDataset(datasetName);
    };

    const applyDatasetChanges = function(changes: unknown): void {
        void options.applyDatasetChanges(changes);
    };

    const goToCase = function(
        datasetName: string,
        caseNumber: unknown
    ): void {
        const nextDataset = String(datasetName || "").trim();

        if (
            nextDataset
            && nextDataset !== options.getCurrentDatasetName()
        ) {
            void options.loadDataset(nextDataset).then(() => {
                options.jumpToCase(caseNumber);
            });
            return;
        }

        options.jumpToCase(caseNumber);
    };

    const goToVariable = function(
        datasetName: string,
        variableName: string
    ): void {
        const nextVariable = String(variableName || "").trim();

        if (!nextVariable) {
            return;
        }

        const nextDataset = String(datasetName || "").trim();

        if (
            nextDataset
            && nextDataset !== options.getCurrentDatasetName()
        ) {
            void options.loadDataset(nextDataset).then(() => {
                options.jumpToVariable(nextVariable);
            });
            return;
        }

        options.jumpToVariable(nextVariable);
    };

        return {
            openDataset,
            refreshDataset,
            goToCase,
            goToVariable,
            bindIpc: function(bridge: DatasetEditorIpcBridge): void {
                bindDatasetEditorIpc(bridge, {
                    initialize: options.initialize,
                    changeLanguage: options.changeLanguage,
                    setDatasetList: options.setDatasetList,
                openDataset,
                refreshDataset,
                filterStateChanged: options.applyFilterStateChanged,
                applyChanges: applyDatasetChanges,
                goToCase,
                goToVariable
            });
        }
    };
};

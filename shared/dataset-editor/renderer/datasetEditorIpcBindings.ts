export interface DatasetEditorInitMessage {
    appPath?: unknown;
    datasetName?: unknown;
    datasetNames?: unknown;
    languageNS?: unknown;
    variableColumnWidths?: unknown;
}


export interface DatasetEditorLanguageMessage {
    appPath: string;
    languageNS: string;
}


export interface DatasetEditorIpcBindings {
    initialize: (payload: DatasetEditorInitMessage) => void;
    changeLanguage: (payload: DatasetEditorLanguageMessage) => void;
    setDatasetList: (datasetNames: string[]) => void;
    openDataset: (datasetName: string) => void;
    refreshDataset: (datasetName: string) => void;
    filterStateChanged: (payload: unknown) => void;
    applyChanges: (changes: unknown) => void;
    goToCase: (datasetName: string, caseNumber: unknown) => void;
    goToVariable: (datasetName: string, variableName: string) => void;
}


export interface DatasetEditorIpcBridge {
    onInit(callback: (payload: DatasetEditorInitMessage) => void): void;
    onLanguageChanged(callback: (payload: DatasetEditorLanguageMessage) => void): void;
    onSetDatasetList(callback: (datasetNames: string[]) => void): void;
    onOpenDataset(callback: (datasetName: string) => void): void;
    onRefreshDataset(callback: (datasetName: string) => void): void;
    onFilterStateChanged(callback: (payload: unknown) => void): void;
    onApplyChanges(callback: (changes: unknown) => void): void;
    onGotoCase(callback: (datasetName: string, caseNumber: unknown) => void): void;
    onGotoVariable(callback: (datasetName: string, variableName: string) => void): void;
}


const normalizedDatasetNames = function(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.map((entry) => {
        return String(entry || "").trim();
    }).filter(Boolean);
};


const datasetNameFromPayload = function(payload: unknown): string {
    if (!payload || typeof payload !== "object") {
        return "";
    }

    const record = payload as Record<string, unknown>;

    return String(record.datasetName || record.name || "").trim();
};


export const bindDatasetEditorIpc = function(
    bridge: DatasetEditorIpcBridge,
    bindings: DatasetEditorIpcBindings
): void {
    bridge.onInit((payload) => {
        bindings.initialize(payload || {});
    });

    bridge.onLanguageChanged((payload) => {
        bindings.changeLanguage(payload);
    });

    bridge.onSetDatasetList((datasetNames) => {
        bindings.setDatasetList(normalizedDatasetNames(datasetNames));
    });

    bridge.onOpenDataset((datasetName) => {
        bindings.openDataset(datasetName);
    });

    bridge.onRefreshDataset((datasetName) => {
        bindings.refreshDataset(datasetName);
    });

    bridge.onFilterStateChanged((payload) => {
        bindings.filterStateChanged(payload);
    });

    bridge.onApplyChanges((changes) => {
        bindings.applyChanges(changes);
    });

    bridge.onGotoCase((datasetName, caseNumber) => {
        bindings.goToCase(datasetName, caseNumber);
    });

    bridge.onGotoVariable((datasetName, variableName) => {
        bindings.goToVariable(datasetName, variableName);
    });
};

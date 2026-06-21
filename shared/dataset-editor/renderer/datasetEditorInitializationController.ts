import type {
    DatasetEditorInitMessage,
    DatasetEditorLanguageMessage
} from "./datasetEditorIpcBindings";

export const createDatasetEditorInitializationController = function(
    options: {
        applyStoredVariableColumnWidths(value: unknown): void;
        initializeLocalization(locale: unknown, appPath: unknown): void;
        setLanguage(locale: unknown, appPath: unknown): void;
        translateMenus(): void;
        translateChrome(): void;
        setActiveTab(tab: "data"): void;
        setDatasetNames(datasetNames: string[]): void;
        syncDatasetSelector(): void;
        loadDataset(datasetName: string): void;
        getCurrentDatasetName(): string;
        renderTitle(datasetName: string): void;
        isVariablesTabActive(): boolean;
        renderVariablesTable(): void;
        isValueLabelsEditorOpen(): boolean;
        renderValueLabelsEditor(): void;
    }
) {
    const normalizeDatasetNames = function(value: unknown): string[] {
        return Array.isArray(value)
            ? value.map((entry) => String(entry || "").trim()).filter(Boolean)
            : [];
    };

    const initialize = function(args: DatasetEditorInitMessage): void {
        options.applyStoredVariableColumnWidths(args.variableColumnWidths);
        options.initializeLocalization(args?.languageNS, args?.appPath);
        options.translateMenus();
        options.translateChrome();
        options.setActiveTab("data");
        options.setDatasetNames(normalizeDatasetNames(args?.datasetNames));
        options.syncDatasetSelector();
        options.loadDataset(String(args?.datasetName || ""));
    };

    const changeLanguage = function(args: DatasetEditorLanguageMessage): void {
        options.setLanguage(args.languageNS, args.appPath);
        options.translateMenus();
        options.translateChrome();
        options.renderTitle(options.getCurrentDatasetName());

        if (options.isVariablesTabActive()) {
            options.renderVariablesTable();
        }

        if (options.isValueLabelsEditorOpen()) {
            options.renderValueLabelsEditor();
        }
    };

    const setDatasetList = function(datasetNames: string[]): void {
        options.setDatasetNames(datasetNames);
        options.syncDatasetSelector();
    };

    return {
        changeLanguage,
        initialize,
        setDatasetList
    };
};

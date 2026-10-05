import {
    bindDatasetEditorIpc,
    type DatasetEditorIpcBridge,
    type DatasetEditorInitMessage,
    type DatasetEditorLanguageMessage
} from "./datasetEditorIpcBindings";
import { runDatasetEditorEventAction } from "./datasetEditorEventAction";


export interface DatasetEditorExternalActionsOptions {
    initialize(payload: DatasetEditorInitMessage): void;
    changeLanguage(payload: DatasetEditorLanguageMessage): void;
    setDatasetList(datasetNames: string[]): void;
    getCurrentDatasetName(): string;
    getLoadSequence(): number;
    hasDatasetSchema(): boolean;
    loadDataset(datasetName: string): Promise<void>;
    refreshDataset(datasetName: string): Promise<void>;
    applyFilterStateChanged(payload: unknown): void;
    applyDatasetChanges(changes: unknown): Promise<void>;
    jumpToCase(caseNumber: unknown): void;
    jumpToVariable(variableName: string): void;
}


export interface DatasetEditorExternalActionsController {
    invalidate(): void;
    bindIpc(bridge: DatasetEditorIpcBridge): void;
    openDataset(datasetName: string): void;
    refreshDataset(datasetName: string): void;
    goToCase(datasetName: string, caseNumber: unknown): void;
    goToVariable(datasetName: string, variableName: string): void;
}


export const createDatasetEditorExternalActionsController = function(
    options: DatasetEditorExternalActionsOptions
): DatasetEditorExternalActionsController {
    let navigationSequence = 0;

    const openDataset = function(datasetName: string): void {
        navigationSequence += 1;
        void runDatasetEditorEventAction("open-dataset", () => options.loadDataset(datasetName));
    };

    const refreshDataset = function(datasetName: string): void {
        navigationSequence += 1;
        void runDatasetEditorEventAction("refresh-dataset", () => options.refreshDataset(datasetName));
    };

    const applyDatasetChanges = function(changes: unknown): void {
        navigationSequence += 1;
        void runDatasetEditorEventAction("apply-dataset-changes", () => options.applyDatasetChanges(changes));
    };

    const navigateAfterOpening = async function(
        datasetName: string,
        request: number,
        jump: () => void
    ): Promise<void> {
        const targetName = datasetName || options.getCurrentDatasetName();
        let loadSequence = options.getLoadSequence();
        if (targetName && targetName !== options.getCurrentDatasetName()) {
            const loading = options.loadDataset(targetName);
            // Opening prepares/reset state synchronously; retain that new owner.
            loadSequence = options.getLoadSequence();
            await loading;
        }

        if (
            request !== navigationSequence
            || loadSequence !== options.getLoadSequence()
            || targetName !== options.getCurrentDatasetName()
            || !options.hasDatasetSchema()
        ) {
            return;
        }

        jump();
    };

    const goToCase = function(
        datasetName: string,
        caseNumber: unknown
    ): void {
        const nextDataset = String(datasetName || "").trim();

        const request = ++navigationSequence;
        void runDatasetEditorEventAction("go-to-case", () =>
            navigateAfterOpening(nextDataset, request, () => options.jumpToCase(caseNumber))
        );
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

        const request = ++navigationSequence;
        void runDatasetEditorEventAction("go-to-variable", () =>
            navigateAfterOpening(nextDataset, request, () => options.jumpToVariable(nextVariable))
        );
    };

    return {
        invalidate: function(): void {
            navigationSequence += 1;
        },
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

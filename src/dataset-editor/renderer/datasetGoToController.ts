import type {
    DatasetEditorSelection
} from "../state/datasetEditorState";


export interface DatasetGoToContext {
    mode: "case" | "variable";
    datasetName: string;
}


export interface DatasetGoToControllerBindings {
    getDatasetName(): string;
    getSelection(): DatasetEditorSelection;
    selectRow(objectName: string, rowIndex: number): void;
    selectColumn(objectName: string, columnName: string): void;
}


export interface DatasetGoToController {
    prepare(mode: "case" | "variable"): DatasetGoToContext;
    consume(): DatasetGoToContext;
    getDatasetName(): string;
    getStateSnapshot(): {
        datasetName: string;
        selection: DatasetEditorSelection;
    };
    goToCase(caseNumber: number): void;
    goToVariable(variableName: string): void;
}


export const createDatasetGoToController = function(
    bindings: DatasetGoToControllerBindings
): DatasetGoToController {
    let context: DatasetGoToContext | null = null;
    let lastDatasetName = "";

    const currentDatasetName = function(): string {
        return bindings.getDatasetName() || lastDatasetName;
    };

    const prepare = function(
        mode: "case" | "variable"
    ): DatasetGoToContext {
        context = {
            mode,
            datasetName: currentDatasetName()
        };
        lastDatasetName = context.datasetName;

        return context;
    };

    const consume = function(): DatasetGoToContext {
        const current = context || {
            mode: "case" as const,
            datasetName: currentDatasetName()
        };

        context = null;
        lastDatasetName = current.datasetName;

        return current;
    };

    const goToCase = function(caseNumber: number): void {
        const objectName = currentDatasetName();
        const rowNumber = Number.isFinite(caseNumber)
            ? Math.trunc(caseNumber)
            : 0;

        if (objectName && rowNumber > 0) {
            bindings.selectRow(objectName, rowNumber - 1);
        }
    };

    const goToVariable = function(variableName: string): void {
        const objectName = currentDatasetName();
        const normalizedName = String(variableName || "").trim();

        if (objectName && normalizedName) {
            bindings.selectColumn(objectName, normalizedName);
        }
    };

    return {
        prepare,
        consume,
        getDatasetName: currentDatasetName,
        getStateSnapshot: function() {
            return {
                datasetName: currentDatasetName(),
                selection: bindings.getSelection()
            };
        },
        goToCase,
        goToVariable
    };
};

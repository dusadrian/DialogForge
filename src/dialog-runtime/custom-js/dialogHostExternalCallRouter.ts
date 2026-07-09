import type {
    DialogExternalCallResult
} from "../../core/contracts/dialogExternalCall";


export interface DialogHostDatasetDescriptor {
    name: string;
    columns?: unknown[];
}


export interface DialogHostDatasetEditorState {
    datasetName: string;
    activeTab: string;
    selectedVariableIndex: number;
    selectedCell: unknown;
}


export interface DialogHostExternalCallRouterOptions {
    getActiveDataset(): string;
    setActiveDataset(name: string): void | Promise<void>;
    clearActiveDataset(): void | Promise<void>;
    listDatasets(): Promise<DialogHostDatasetDescriptor[]> | DialogHostDatasetDescriptor[];
    getDatasetEditorState(): DialogHostDatasetEditorState;
    goToDatasetVariable(variableName: string): void | Promise<void>;
    goToDatasetCase(caseNumber: number): void | Promise<void>;
    fallback(name: string, parameters: Record<string, unknown>): Promise<DialogExternalCallResult>;
}


const ready = function(name: string, value: unknown): DialogExternalCallResult {
    return {
        status: "ready",
        name,
        value,
        message: "Dialog host external call resolved."
    };
};


const readParameters = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
};


export const routeDialogHostExternalCall = async function(
    name: string,
    parameters: unknown,
    options: DialogHostExternalCallRouterOptions
): Promise<DialogExternalCallResult> {
    const input = readParameters(parameters);

    if (name === "activeDataset:get") {
        return ready(name, options.getActiveDataset());
    }

    if (name === "activeDataset:set") {
        const datasetName = String(input.name || "").trim();

        if (datasetName) {
            await options.setActiveDataset(datasetName);
        }

        return ready(name, options.getActiveDataset());
    }

    if (name === "activeDataset:clear") {
        await options.clearActiveDataset();
        return ready(name, "");
    }

    if (name === "datasetViewer:getVariables") {
        const datasetName = String(input.name || "").trim();
        const datasets = await options.listDatasets();
        const dataset = datasets.find((entry) => {
            return entry.name === datasetName;
        });

        return ready(
            name,
            Array.isArray(dataset?.columns) ? dataset.columns : []
        );
    }

    if (name === "datasetEditor:getActiveState") {
        return ready(name, options.getDatasetEditorState());
    }

    if (name === "datasetEditor:consumeGoToContext") {
        return ready(name, {
            datasetName: options.getDatasetEditorState().datasetName,
            mode: "Variable"
        });
    }

    if (name === "datasetEditor:gotoVariable") {
        const variableName = String(input.variableName || "").trim();

        if (variableName) {
            await options.goToDatasetVariable(variableName);
        }

        return ready(name, true);
    }

    if (name === "datasetEditor:gotoCase") {
        const caseNumber = Number(input.caseNumber || 0);

        if (caseNumber > 0) {
            await options.goToDatasetCase(caseNumber);
        }

        return ready(name, true);
    }

    return options.fallback(name, input);
};

import {
    addSortByVariables,
    bindSelectExpression,
    buildSortByCommand,
    clearFilterState,
    clearSplitByState,
    clearWeightByState,
    createDialogBindingState,
    getDatasetVariablesForDialog,
    getFilterState,
    getRememberedVariableDependents,
    getSortByAvailableVariables,
    getSortByButtonDirection,
    getSortByChoiceItems,
    getSortByTargetDataset,
    getSplitByState,
    getWeightByState,
    inheritSubsetDatasetState,
    keepSortByVariables,
    rememberVariableSelections,
    removeSortByVariables,
    refreshSelectExpression,
    setDialogButtonDirection,
    setFilterState,
    setSplitByState,
    setWeightByState,
    type DialogBindingState,
    type DialogDatasetDescriptor
} from "./dialogBindings";
import {
    hasSummaryStatisticSelection,
    refreshSummarySyntax,
    syncSummaryStatisticSelection
} from "./summaryBindings";
import type {
    DialogExternalCallResult
} from "../../core/contracts/dialogExternalCall";

export type {
    DialogExternalCallResult
} from "../../core/contracts/dialogExternalCall";


export interface DialogExternalCallHostOptions {
    datasets?: DialogDatasetDescriptor[];
    resolveDatasets?: () => Promise<DialogDatasetDescriptor[]> | DialogDatasetDescriptor[];
    state?: DialogBindingState;
}


interface DialogControlUpdateResult {
    controlValues: Record<string, unknown>;
    controlSelections: Record<string, string[]>;
}


const implementedBindings = new Set([
    "getDatasetVariablesForDialog",
    "setFilterState",
    "getFilterState",
    "clearFilterState",
    "setSplitByState",
    "getSplitByState",
    "clearSplitByState",
    "setWeightByState",
    "getWeightByState",
    "clearWeightByState",
    "keepSortByVariables",
    "addSortByVariables",
    "removeSortByVariables",
    "getSortByAvailableVariables",
    "getSortByChoiceItems",
    "getSortByButtonDirection",
    "buildSortByCommand",
    "bindCrosstabsWorkspace",
    "bindFrequenciesWorkspace",
    "bindSummaryWorkspaceUpdates",
    "getSortByTargetDataset",
    "hasSummaryStatisticSelection",
    "refreshDatasetEditor",
    "refreshSummarySyntax",
    "inheritSubsetDatasetState",
    "rememberVariableSelections",
    "bindSelectExpressionMonaco",
    "refreshSelectExpressionMonaco",
    "syncSummaryStatisticSelection",
    "setSortByButtonDirection",
    "setSplitByButtonDirection",
    "setWeightByButtonDirection"
]);


const ok = function(name: string, value: unknown): DialogExternalCallResult {
    return {
        status: "ready",
        name,
        value,
        message: "Dialog external call resolved."
    };
};


const unsupported = function(name: string): DialogExternalCallResult {
    return {
        status: "unsupported",
        name,
        value: null,
        message: "Dialog external call is not implemented."
    };
};


const getObject = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
};


const getControlSnapshot = function(parameters: Record<string, unknown>): Record<string, { selected?: unknown[] }> {
    const snapshot = parameters.__controlSnapshot;

    return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
        ? snapshot as Record<string, { selected?: unknown[] }>
        : {};
};


const getSelectedControlValue = function(parameters: Record<string, unknown>, controlName: string): string {
    const selected = getControlSnapshot(parameters)[controlName]?.selected;

    return Array.isArray(selected) ? String(selected[0] || "").trim() : "";
};


export const createDialogExternalCallHost = function(options: DialogExternalCallHostOptions = {}) {
    const state = options.state || createDialogBindingState();

    const resolveDatasets = async function(): Promise<DialogDatasetDescriptor[]> {
        if (options.resolveDatasets) {
            return options.resolveDatasets();
        }

        return options.datasets || [];
    };

    const createDatasetControlUpdate = async function(
        parameters: Record<string, unknown>,
        datasetControl: string,
        variableControls: string[]
    ): Promise<DialogControlUpdateResult> {
        const datasets = await resolveDatasets();
        const selectedDataset = getSelectedControlValue(parameters, datasetControl);
        const dataset = datasets.find((entry) => {
            return entry.name === selectedDataset;
        });
        const result: DialogControlUpdateResult = {
            controlValues: {},
            controlSelections: {}
        };

        if (datasetControl) {
            result.controlValues[datasetControl] = datasets.map((entry) => {
                return entry.name;
            });
        }

        const rememberedControls = getRememberedVariableDependents(state, datasetControl);
        const controls = Array.from(new Set(
            (variableControls.filter(Boolean).length > 0 ? variableControls : rememberedControls).filter(Boolean)
        ));

        controls.forEach((controlName) => {
            const columns = dataset ? dataset.columns.slice() : [];
            const selected = getControlSnapshot(parameters)[controlName]?.selected;
            const selectedColumns = Array.isArray(selected)
                ? selected.map(String).filter((entry) => {
                    return columns.includes(entry);
                })
                : [];

            result.controlValues[controlName] = columns;
            if (!dataset) {
                result.controlSelections[controlName] = [];
            } else if (Array.isArray(selected)) {
                result.controlSelections[controlName] = selectedColumns;
            }
        });

        return result;
    };

    return {
        state,
        supports: function(name: string): boolean {
            return implementedBindings.has(name);
        },
        call: async function(name: string, parameters: Record<string, unknown> = {}): Promise<DialogExternalCallResult> {
            if (name === "getDatasetVariablesForDialog") {
                const datasets = await resolveDatasets();

                return ok(name, getDatasetVariablesForDialog(datasets, String(parameters.dataset || "")));
            }

            if (name === "rememberVariableSelections") {
                return ok(name, rememberVariableSelections(state, {
                    source: String(parameters.source || ""),
                    dependents: Array.isArray(parameters.dependents) ? parameters.dependents.map(String) : []
                }));
            }

            if (name === "bindSelectExpressionMonaco") {
                return ok(name, {
                    selectExpression: bindSelectExpression(state, {
                        input: String(parameters.input || ""),
                        dataset: String(parameters.dataset || "")
                    })
                });
            }

            if (name === "refreshSelectExpressionMonaco") {
                return ok(name, {
                    selectExpression: refreshSelectExpression(state, {
                        input: String(parameters.input || ""),
                        dataset: String(parameters.dataset || "")
                    })
                });
            }

            if (name === "bindFrequenciesWorkspace") {
                return ok(name, await createDatasetControlUpdate(
                    parameters,
                    String(parameters.datasets || ""),
                    [String(parameters.variables || "")]
                ));
            }

            if (name === "bindCrosstabsWorkspace") {
                return ok(name, await createDatasetControlUpdate(
                    parameters,
                    String(parameters.datasets || ""),
                    [String(parameters.rows || ""), String(parameters.cols || "")]
                ));
            }

            if (name === "bindSummaryWorkspaceUpdates") {
                const controls = getObject(parameters.controls || parameters);

                return ok(name, await createDatasetControlUpdate(
                    parameters,
                    String(controls.datasets || ""),
                    [String(controls.variables || "")]
                ));
            }

            if (name === "refreshDatasetEditor") {
                return ok(name, {
                    refreshDatasetName: String(parameters.datasetName || parameters.name || "").trim()
                });
            }

            if (name === "setFilterState") {
                return ok(name, setFilterState(state, {
                    dataset: String(parameters.dataset || ""),
                    command: String(parameters.command || "")
                }));
            }

            if (name === "getFilterState") {
                return ok(name, getFilterState(state, String(parameters.dataset || "")));
            }

            if (name === "clearFilterState") {
                clearFilterState(state, String(parameters.dataset || ""));
                return ok(name, null);
            }

            if (name === "setSplitByState") {
                const request: {
                    dataset: string;
                    grouping: string[];
                    sortdataset?: boolean;
                } = {
                    dataset: String(parameters.dataset || ""),
                    grouping: Array.isArray(parameters.grouping) ? parameters.grouping.map(String) : []
                };

                if (Object.prototype.hasOwnProperty.call(parameters, "sortdataset")) {
                    request.sortdataset = parameters.sortdataset === true;
                }

                return ok(name, setSplitByState(state, request));
            }

            if (name === "getSplitByState") {
                return ok(name, getSplitByState(state, String(parameters.dataset || "")));
            }

            if (name === "clearSplitByState") {
                clearSplitByState(state, String(parameters.dataset || ""));
                return ok(name, null);
            }

            if (name === "setWeightByState") {
                return ok(name, setWeightByState(state, {
                    dataset: String(parameters.dataset || ""),
                    weighting: String(parameters.weighting || "")
                }));
            }

            if (name === "inheritSubsetDatasetState") {
                return ok(name, inheritSubsetDatasetState(state, {
                    source: String(parameters.source || ""),
                    target: String(parameters.target || ""),
                    variables: Array.isArray(parameters.variables) ? parameters.variables.map(String) : []
                }));
            }

            if (name === "getWeightByState") {
                return ok(name, getWeightByState(state, String(parameters.dataset || "")));
            }

            if (name === "clearWeightByState") {
                clearWeightByState(state, String(parameters.dataset || ""));
                return ok(name, null);
            }

            if (name === "keepSortByVariables") {
                return ok(name, keepSortByVariables({
                    sorting: Array.isArray(parameters.sorting) ? parameters.sorting.map(String) : [],
                    variables: Array.isArray(parameters.variables) ? parameters.variables.map(String) : []
                }));
            }

            if (name === "addSortByVariables") {
                return ok(name, addSortByVariables({
                    sorting: Array.isArray(parameters.sorting) ? parameters.sorting.map(String) : [],
                    selected: Array.isArray(parameters.selected) ? parameters.selected.map(String) : []
                }));
            }

            if (name === "removeSortByVariables") {
                return ok(name, removeSortByVariables({
                    sorting: Array.isArray(parameters.sorting) ? parameters.sorting.map(String) : [],
                    selected: Array.isArray(parameters.selected) ? parameters.selected.map(String) : []
                }));
            }

            if (name === "getSortByAvailableVariables") {
                return ok(name, getSortByAvailableVariables({
                    variables: Array.isArray(parameters.variables) ? parameters.variables.map(String) : [],
                    sorting: Array.isArray(parameters.sorting) ? parameters.sorting.map(String) : []
                }));
            }

            if (name === "getSortByChoiceItems") {
                return ok(name, getSortByChoiceItems({
                    sorting: Array.isArray(parameters.sorting) ? parameters.sorting.map(String) : []
                }));
            }

            if (name === "getSortByButtonDirection") {
                return ok(name, getSortByButtonDirection({
                    choiceSelected: Array.isArray(parameters.choiceSelected) ? parameters.choiceSelected.map(String) : [],
                    variableSelected: Array.isArray(parameters.variableSelected) ? parameters.variableSelected.map(String) : []
                }));
            }

            if (name === "setSortByButtonDirection") {
                return ok(name, setDialogButtonDirection(state, "sortBy", String(parameters.direction || "")));
            }

            if (name === "setSplitByButtonDirection") {
                return ok(name, setDialogButtonDirection(state, "splitBy", String(parameters.direction || "")));
            }

            if (name === "setWeightByButtonDirection") {
                return ok(name, setDialogButtonDirection(state, "weightBy", String(parameters.direction || "")));
            }

            if (name === "hasSummaryStatisticSelection") {
                return ok(name, hasSummaryStatisticSelection(parameters));
            }

            if (name === "syncSummaryStatisticSelection") {
                return ok(name, syncSummaryStatisticSelection(parameters));
            }

            if (name === "refreshSummarySyntax") {
                return ok(name, refreshSummarySyntax(state, parameters));
            }

            if (name === "buildSortByCommand") {
                return ok(name, buildSortByCommand({
                    dataset: String(parameters.dataset || ""),
                    sorting: Array.isArray(parameters.sorting) ? parameters.sorting.map(String) : [],
                    createNew: parameters.createNew === true,
                    datasetName: String(parameters.datasetName || "")
                }));
            }

            if (name === "getSortByTargetDataset") {
                return ok(name, getSortByTargetDataset({
                    dataset: String(parameters.dataset || ""),
                    createNew: parameters.createNew === true,
                    datasetName: String(parameters.datasetName || "")
                }));
            }

            return unsupported(name);
        }
    };
};

export interface DialogDatasetDescriptor {
    name: string;
    columns: string[];
}


export interface DialogFilterState {
    dataset: string;
    command: string;
}


export interface DialogSplitState {
    dataset: string;
    grouping: string[];
    sortdataset?: boolean;
}


export interface DialogWeightState {
    dataset: string;
    weighting: string;
}


export interface DialogBindingState {
    filters: Record<string, DialogFilterState>;
    splits: Record<string, DialogSplitState>;
    weights: Record<string, DialogWeightState>;
    buttonDirections: Record<string, string>;
    variableSelectionMemory: Record<string, DialogVariableSelectionMemory>;
    selectExpressionBindings: Record<string, DialogSelectExpressionBinding>;
}


export interface DialogVariableSelectionMemory {
    source: string;
    dependents: string[];
}


export interface DialogSelectExpressionBinding {
    input: string;
    dataset: string;
}


export const createDialogBindingState = function(): DialogBindingState {
    return {
        filters: {},
        splits: {},
        weights: {},
        buttonDirections: {},
        variableSelectionMemory: {},
        selectExpressionBindings: {}
    };
};


const cleanName = function(value: unknown): string {
    return String(value || "").trim();
};


const cleanNames = function(values: unknown): string[] {
    return Array.isArray(values)
        ? values.map(cleanName).filter(Boolean)
        : [];
};


export const getDatasetVariablesForDialog = function(
    datasets: DialogDatasetDescriptor[],
    datasetName: string
): string[] {
    const dataset = datasets.find((entry) => {
        return entry.name === datasetName;
    });

    return dataset ? dataset.columns.slice() : [];
};


export const rememberVariableSelections = function(
    state: DialogBindingState,
    input: {
        source: string;
        dependents: string[];
    }
): DialogVariableSelectionMemory {
    const source = cleanName(input.source);
    const dependents = cleanNames(input.dependents);
    const memory = {
        source,
        dependents
    };

    if (source) {
        state.variableSelectionMemory[source] = memory;
    }

    return memory;
};


export const getRememberedVariableDependents = function(
    state: DialogBindingState,
    source: string
): string[] {
    return state.variableSelectionMemory[cleanName(source)]?.dependents.slice() || [];
};


export const bindSelectExpression = function(
    state: DialogBindingState,
    input: DialogSelectExpressionBinding
): DialogSelectExpressionBinding {
    const binding = {
        input: cleanName(input.input),
        dataset: cleanName(input.dataset)
    };

    if (binding.input) {
        state.selectExpressionBindings[binding.input] = binding;
    }

    return binding;
};


export const refreshSelectExpression = function(
    state: DialogBindingState,
    input?: {
        input?: string;
        dataset?: string;
    }
): DialogSelectExpressionBinding | null {
    const requestedInput = cleanName(input?.input);
    const requestedDataset = cleanName(input?.dataset);

    if (requestedInput) {
        return state.selectExpressionBindings[requestedInput] || null;
    }

    const bindings = Object.values(state.selectExpressionBindings);
    if (requestedDataset) {
        return bindings.find((binding) => {
            return binding.dataset === requestedDataset;
        }) || null;
    }

    return bindings[0] || null;
};


export const setFilterState = function(
    state: DialogBindingState,
    input: DialogFilterState
): DialogFilterState {
    const dataset = cleanName(input.dataset);
    const next = {
        dataset,
        command: String(input.command || "").trim()
    };

    if (dataset && next.command) {
        state.filters[dataset] = next;
    }

    return next;
};


export const getFilterState = function(state: DialogBindingState, dataset: string): DialogFilterState | null {
    return state.filters[cleanName(dataset)] || null;
};


export const clearFilterState = function(state: DialogBindingState, dataset: string): void {
    delete state.filters[cleanName(dataset)];
};


export const setSplitByState = function(
    state: DialogBindingState,
    input: DialogSplitState
): DialogSplitState {
    const dataset = cleanName(input.dataset);
    const next: DialogSplitState = {
        dataset,
        grouping: cleanNames(input.grouping)
    };

    if (Object.prototype.hasOwnProperty.call(input, "sortdataset")) {
        next.sortdataset = input.sortdataset === true;
    }

    if (dataset && next.grouping.length > 0) {
        state.splits[dataset] = next;
    }

    return next;
};


export const getSplitByState = function(state: DialogBindingState, dataset: string): DialogSplitState | null {
    return state.splits[cleanName(dataset)] || null;
};


export const clearSplitByState = function(state: DialogBindingState, dataset: string): void {
    delete state.splits[cleanName(dataset)];
};


export const setWeightByState = function(
    state: DialogBindingState,
    input: DialogWeightState
): DialogWeightState {
    const dataset = cleanName(input.dataset);
    const next = {
        dataset,
        weighting: cleanName(input.weighting)
    };

    if (dataset && next.weighting) {
        state.weights[dataset] = next;
    }

    return next;
};


export const getWeightByState = function(state: DialogBindingState, dataset: string): DialogWeightState | null {
    return state.weights[cleanName(dataset)] || null;
};


export const clearWeightByState = function(state: DialogBindingState, dataset: string): void {
    delete state.weights[cleanName(dataset)];
};


export const inheritSubsetDatasetState = function(
    state: DialogBindingState,
    input: {
        source: string;
        target: string;
        variables?: string[];
    }
): {
    filter: DialogFilterState | null;
    split: DialogSplitState | null;
    weight: DialogWeightState | null;
} {
    const source = cleanName(input.source);
    const target = cleanName(input.target);
    const variables = new Set(cleanNames(input.variables || []));
    const filter = source ? state.filters[source] || null : null;
    const split = source ? state.splits[source] || null : null;
    const weight = source ? state.weights[source] || null : null;

    if (!source || !target) {
        return {
            filter: null,
            split: null,
            weight: null
        };
    }

    if (filter) {
        state.filters[target] = {
            dataset: target,
            command: filter.command
        };
    }

    if (split) {
        state.splits[target] = {
            dataset: target,
            grouping: variables.size
                ? split.grouping.filter((name) => {
                    return variables.has(name);
                })
                : split.grouping.slice(),
            sortdataset: split.sortdataset
        };
    }

    if (weight && (!variables.size || variables.has(weight.weighting))) {
        state.weights[target] = {
            dataset: target,
            weighting: weight.weighting
        };
    }

    return {
        filter: state.filters[target] || null,
        split: state.splits[target] || null,
        weight: state.weights[target] || null
    };
};


export const setDialogButtonDirection = function(
    state: DialogBindingState,
    key: string,
    direction: string
): string {
    const nextDirection = cleanName(direction) === "left" ? "left" : "right";

    state.buttonDirections[cleanName(key)] = nextDirection;
    return nextDirection;
};


export const getDialogButtonDirection = function(
    state: DialogBindingState,
    key: string
): string {
    return state.buttonDirections[cleanName(key)] || "right";
};


export const hasSummaryStatisticSelection = function(input: {
    selectedStatistics?: string[];
    statistics?: Record<string, unknown>;
}): boolean {
    if (cleanNames(input.selectedStatistics || []).length > 0) {
        return true;
    }

    const statistics = input.statistics && typeof input.statistics === "object" ? input.statistics : {};

    return Object.values(statistics).some((value) => {
        return value === true || value === "true" || value === 1 || value === "1";
    });
};


export const keepSortByVariables = function(input: {
    sorting: string[];
    variables: string[];
}): string[] {
    const available = new Set(cleanNames(input.variables));

    return cleanNames(input.sorting).filter((name) => {
        return available.has(name);
    });
};


export const addSortByVariables = function(input: {
    sorting: string[];
    selected: string[];
}): string[] {
    return Array.from(new Set(cleanNames(input.sorting).concat(cleanNames(input.selected))));
};


export const removeSortByVariables = function(input: {
    sorting: string[];
    selected: string[];
}): string[] {
    const selected = new Set(cleanNames(input.selected));

    return cleanNames(input.sorting).filter((name) => {
        return !selected.has(name);
    });
};


export const getSortByAvailableVariables = function(input: {
    variables: string[];
    sorting: string[];
}): string[] {
    const sorting = new Set(cleanNames(input.sorting));

    return cleanNames(input.variables).filter((name) => {
        return !sorting.has(name);
    });
};


export const getSortByChoiceItems = function(input: { sorting: string[] }): string[] {
    return cleanNames(input.sorting);
};


export const getSortByButtonDirection = function(input: {
    choiceSelected: string[];
    variableSelected: string[];
}): "left" | "right" {
    if (cleanNames(input.choiceSelected).length > 0) {
        return "left";
    }

    if (cleanNames(input.variableSelected).length > 0) {
        return "right";
    }

    return "right";
};


export const getSortByTargetDataset = function(input: {
    dataset: string;
    createNew: boolean;
    datasetName: string;
}): string {
    const datasetName = cleanName(input.datasetName);

    return input.createNew && datasetName ? datasetName : cleanName(input.dataset);
};


export const buildSortByCommand = function(input: {
    dataset: string;
    sorting: string[];
    createNew: boolean;
    datasetName: string;
}): string {
    const dataset = cleanName(input.dataset);
    const sorting = cleanNames(input.sorting);

    if (!dataset || sorting.length === 0) {
        return "";
    }

    const target = getSortByTargetDataset(input);
    const prefix = input.createNew && target && target !== dataset ? `${target} <- ` : `${dataset} <- `;

    return `${prefix}${dataset}[order(${sorting.join(", ")}), , drop = FALSE]\n`;
};

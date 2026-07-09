import {
    clearFilterState,
    clearSplitByState,
    clearWeightByState,
    getFilterState,
    getSplitByState,
    getWeightByState,
    inheritSubsetDatasetState,
    setFilterState,
    setSplitByState,
    setWeightByState,
    type DialogBindingState
} from "./dialogBindings";


export interface DialogStateCallRouterOptions {
    state: DialogBindingState;
    onFilterStateChanged?(dataset: string): void;
    onConsoleStateChanged?(dataset: string): void;
}


const readNameList = function(value: unknown): string[] {
    return Array.isArray(value)
        ? value.map((name) => String(name || "").trim()).filter(Boolean)
        : [];
};


const readParameters = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
};


export const routeDialogStateCall = function(
    callName: string,
    parameters: unknown,
    options: DialogStateCallRouterOptions
): unknown {
    const input = readParameters(parameters);
    const dataset = String(input.dataset || "").trim();
    const notifyFilter = function(target = dataset): void {
        options.onFilterStateChanged?.(target);
    };
    const notifyConsole = function(target = dataset): void {
        options.onConsoleStateChanged?.(target);
        options.onFilterStateChanged?.(target);
    };

    if (callName === "getFilterState") {
        return getFilterState(options.state, dataset) || {};
    }

    if (callName === "setFilterState") {
        const command = String(input.command || "").trim();

        if (!command) {
            clearFilterState(options.state, dataset);
            notifyFilter();
            return {};
        }

        const value = setFilterState(options.state, { dataset, command });

        notifyFilter();
        return value;
    }

    if (callName === "clearFilterState") {
        clearFilterState(options.state, dataset);
        notifyFilter();
        return {};
    }

    if (callName === "getSplitByState") {
        return getSplitByState(options.state, dataset) || {};
    }

    if (callName === "setSplitByState") {
        const grouping = readNameList(input.grouping);

        if (!grouping.length) {
            clearSplitByState(options.state, dataset);
            notifyConsole();
            return {};
        }

        const value = setSplitByState(options.state, {
            dataset,
            grouping,
            sortdataset: input.sortdataset === true
        });

        notifyConsole();
        return value;
    }

    if (callName === "clearSplitByState") {
        clearSplitByState(options.state, dataset);
        notifyConsole();
        return {};
    }

    if (callName === "getWeightByState") {
        return getWeightByState(options.state, dataset) || {};
    }

    if (callName === "setWeightByState") {
        const weighting = String(input.weighting || "").trim();

        if (!weighting) {
            clearWeightByState(options.state, dataset);
            notifyConsole();
            return {};
        }

        const value = setWeightByState(options.state, { dataset, weighting });

        notifyConsole();
        return value;
    }

    if (callName === "clearWeightByState") {
        clearWeightByState(options.state, dataset);
        notifyConsole();
        return {};
    }

    if (callName === "inheritSubsetDatasetState") {
        const target = String(input.target || "");
        const value = inheritSubsetDatasetState(options.state, {
            source: String(input.source || ""),
            target,
            variables: readNameList(input.variables)
        });

        notifyConsole(target);
        return value;
    }

    return null;
};

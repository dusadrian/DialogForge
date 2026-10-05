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
import {
    readProductDialogWorkspaceDeliveryWarning,
    type ProductDialogWorkspaceDeliveryResult
} from "../dialog-builder/productDialogWorkspaceDelivery";


export const createDialogFilterStateDelivery = function(options: {
    readFilterState(dataset: string): unknown;
    getSessionScope?(): unknown;
    refreshDialogs(dataset: string): Promise<ProductDialogWorkspaceDeliveryResult | void>;
    publishFilterState(payload: { dataset: string; filter: unknown }): void | Promise<void>;
    reportWarning?(message: string): void;
}) {
    let requestSequence = 0;

    return async function(dataset: string): Promise<void> {
        const scope = options.getSessionScope?.();
        const sequence = ++requestSequence;
        const result = await options.refreshDialogs(dataset);

        if (sequence !== requestSequence || scope !== options.getSessionScope?.()) {
            return;
        }

        const warning = readProductDialogWorkspaceDeliveryWarning(result);
        if (warning) {
            options.reportWarning?.(warning);
        }
        await options.publishFilterState({
            dataset,
            filter: dataset ? options.readFilterState(dataset) : null
        });
    };
};


export interface DialogStateCallRouterOptions {
    state: DialogBindingState;
    onFilterStateChanged?(dataset: string): void | Promise<void>;
    onConsoleStateChanged?(dataset: string): void | Promise<void>;
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


export const routeDialogStateCall = async function(
    callName: string,
    parameters: unknown,
    options: DialogStateCallRouterOptions
): Promise<unknown> {
    const input = readParameters(parameters);
    const dataset = String(input.dataset || "").trim();
    const notifyFilter = async function(target = dataset): Promise<void> {
        await options.onFilterStateChanged?.(target);
    };
    const notifyConsole = async function(target = dataset): Promise<void> {
        await options.onConsoleStateChanged?.(target);
        await options.onFilterStateChanged?.(target);
    };

    if (callName === "getFilterState") {
        return getFilterState(options.state, dataset);
    }

    if (callName === "setFilterState") {
        const command = String(input.command || "").trim();

        const value = setFilterState(options.state, { dataset, command });

        await notifyFilter();
        return value;
    }

    if (callName === "clearFilterState") {
        clearFilterState(options.state, dataset);
        await notifyFilter();
        return null;
    }

    if (callName === "getSplitByState") {
        return getSplitByState(options.state, dataset);
    }

    if (callName === "setSplitByState") {
        const grouping = readNameList(input.grouping);

        const value = setSplitByState(options.state, {
            dataset,
            grouping,
            ...(Object.prototype.hasOwnProperty.call(input, "sortdataset")
                ? { sortdataset: input.sortdataset === true }
                : {})
        });

        await notifyConsole();
        return value;
    }

    if (callName === "clearSplitByState") {
        clearSplitByState(options.state, dataset);
        await notifyConsole();
        return null;
    }

    if (callName === "getWeightByState") {
        return getWeightByState(options.state, dataset);
    }

    if (callName === "setWeightByState") {
        const weighting = String(input.weighting || "").trim();

        const value = setWeightByState(options.state, { dataset, weighting });

        await notifyConsole();
        return value;
    }

    if (callName === "clearWeightByState") {
        clearWeightByState(options.state, dataset);
        await notifyConsole();
        return null;
    }

    if (callName === "inheritSubsetDatasetState") {
        const target = String(input.target || "");
        const value = inheritSubsetDatasetState(options.state, {
            source: String(input.source || ""),
            target,
            variables: readNameList(input.variables)
        });

        await notifyConsole(target);
        return value;
    }

    return null;
};

import type {
    DialogExternalCallResult
} from "../../core/contracts/dialogExternalCall";


export const dialogStateExternalCallNames = new Set([
    "getFilterState",
    "setFilterState",
    "clearFilterState",
    "getSplitByState",
    "setSplitByState",
    "clearSplitByState",
    "getWeightByState",
    "setWeightByState",
    "clearWeightByState",
    "inheritSubsetDatasetState"
]);

export const isDialogStateExternalCall = function(name: string): boolean {
    return dialogStateExternalCallNames.has(name);
};


export const createDialogStateExternalCallResult = function(
    name: string,
    value: unknown
): DialogExternalCallResult {
    return {
        status: "ready",
        name,
        value,
        message: "Dialog state external call resolved."
    };
};


export const createEmptyDialogExternalCallResult = function(
    name: string
): DialogExternalCallResult {
    return {
        status: "ready",
        name,
        value: {},
        message: "No dialog external-call value was produced."
    };
};

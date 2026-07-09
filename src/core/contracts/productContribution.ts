import type {
    DialogExternalCallHost
} from "./dialogExternalCall";
import type {
    RuntimeSessionManager
} from "../../runtime/provider-contract/runtimeProvider";


export const PRODUCT_CONTRIBUTION_CONTRACT_VERSION = 1;


export interface ProductConsoleStateChip {
    id: string;
    labelKey: string;
    accessibilityLabelKey: string;
    value: string;
}


export interface ProductConsoleStateChipSnapshot {
    dataset: string;
    chips: ProductConsoleStateChip[];
}


export interface ProductContributionContext {
    executeRuntimeMethod:
        RuntimeSessionManager["executeRuntimeMethod"];
    callSharedDialogExternal(
        name: string,
        parameters?: Record<string, unknown>
    ): Promise<unknown>;
}


export interface ProductContribution {
    id: string;
    dialogForgeProductContract?: typeof PRODUCT_CONTRIBUTION_CONTRACT_VERSION;
    createDialogExternalCallHosts(
        context: ProductContributionContext
    ): Record<string, DialogExternalCallHost>;
    consoleStateChipMutationCalls?: string[];
    readConsoleStateChips?(
        context: ProductContributionContext,
        dataset: string
    ): Promise<ProductConsoleStateChip[]>;
}


const joinConsoleChipNames = function(values: unknown): string {
    return Array.isArray(values)
        ? values
            .map((name) => String(name || "").trim())
            .filter(Boolean)
            .join(", ")
        : "";
};


export const dialogConsoleStateChipMutationCalls = [
    "setSplitByState",
    "clearSplitByState",
    "setWeightByState",
    "clearWeightByState",
    "inheritSubsetDatasetState"
] as const;


export const readDialogConsoleStateChips = async function(
    context: Pick<ProductContributionContext, "callSharedDialogExternal">,
    dataset: string
): Promise<ProductConsoleStateChip[]> {
    const datasetName = String(dataset || "").trim();
    const [weightState, splitState] = await Promise.all([
        context.callSharedDialogExternal("getWeightByState", {
            dataset: datasetName
        }),
        context.callSharedDialogExternal("getSplitByState", {
            dataset: datasetName
        })
    ]);
    const weight = weightState && typeof weightState === "object"
        ? String((weightState as { weighting?: unknown }).weighting || "").trim()
        : "";
    const split = splitState && typeof splitState === "object"
        ? joinConsoleChipNames((splitState as { grouping?: unknown }).grouping)
        : "";

    return [
        {
            id: "weight-variable",
            labelKey: "Weight",
            accessibilityLabelKey: "Weight variable",
            value: weight
        },
        {
            id: "split-variables",
            labelKey: "Split",
            accessibilityLabelKey: "Split variables",
            value: split
        }
    ];
};

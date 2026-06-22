import type {
    DialogExternalCallHost
} from "./dialogExternalCall";
import type {
    RuntimeSessionManager
} from "../../runtime/provider-contract/runtimeProvider";


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
    createDialogExternalCallHosts(
        context: ProductContributionContext
    ): Record<string, DialogExternalCallHost>;
    consoleStateChipMutationCalls?: string[];
    readConsoleStateChips?(
        context: ProductContributionContext,
        dataset: string
    ): Promise<ProductConsoleStateChip[]>;
}

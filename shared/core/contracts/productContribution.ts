import type {
    DialogExternalCallHost
} from "./dialogExternalCall";
import type {
    RuntimeSessionManager
} from "../../runtime/provider-contract/runtimeProvider";


export interface ProductContributionContext {
    executeRuntimeMethod:
        RuntimeSessionManager["executeRuntimeMethod"];
}


export interface ProductContribution {
    id: string;
    createDialogExternalCallHosts(
        context: ProductContributionContext
    ): Record<string, DialogExternalCallHost>;
}

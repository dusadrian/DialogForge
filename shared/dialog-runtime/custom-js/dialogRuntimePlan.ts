import type { DialogSourceSummary } from "../dialogSource";
import type { DialogExternalCallHost } from "../../core/contracts/dialogExternalCall";


export interface DialogRuntimeExternalCallPlan {
    supported: string[];
    unsupported: string[];
}


export interface DialogRuntimePlan {
    status: string;
    sourcePath: string;
    hasCustomJS: boolean;
    externalCalls: DialogRuntimeExternalCallPlan;
}


const uniqueSorted = function(values: string[]): string[] {
    return Array.from(new Set(values)).sort();
};


export const createDialogRuntimeExternalCallPlan = function(
    externalCalls: string[],
    host: Pick<DialogExternalCallHost, "supports">
): DialogRuntimeExternalCallPlan {
    const supported: string[] = [];
    const unsupported: string[] = [];

    uniqueSorted(externalCalls).forEach((name) => {
        if (host.supports && host.supports(name)) {
            supported.push(name);
        } else {
            unsupported.push(name);
        }
    });

    return {
        supported,
        unsupported
    };
};


export const createDialogRuntimePlan = function(
    source: DialogSourceSummary,
    host: Pick<DialogExternalCallHost, "supports">
): DialogRuntimePlan {
    return {
        status: source.status,
        sourcePath: source.sourcePath,
        hasCustomJS: source.hasCustomJS,
        externalCalls: createDialogRuntimeExternalCallPlan(source.externalCalls, host)
    };
};

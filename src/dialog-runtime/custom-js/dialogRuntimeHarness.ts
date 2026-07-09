import type {
    DialogExternalCallHost
} from "../../core/contracts/dialogExternalCall";
import type { DialogExternalCallResult } from "./externalCallHost";


export interface DialogRuntimeHarnessCall {
    name: string;
    parameters: Record<string, unknown>;
    result: DialogExternalCallResult;
}


export interface DialogRuntimeHarness {
    callExternal: (name: string, parameters?: Record<string, unknown>) => Promise<unknown>;
    supportsExternalCall: (name: string) => boolean;
    listCalls: () => DialogRuntimeHarnessCall[];
    getLastResult: () => DialogExternalCallResult | null;
}


export interface DialogRuntimeHarnessOptions {
    externalCallHost: DialogExternalCallHost;
}


export const createDialogRuntimeHarness = function(options: DialogRuntimeHarnessOptions): DialogRuntimeHarness {
    const calls: DialogRuntimeHarnessCall[] = [];

    const supportsExternalCall = function(name: string): boolean {
        return options.externalCallHost.supports ? options.externalCallHost.supports(name) : false;
    };

    const callExternal = async function(
        name: string,
        parameters: Record<string, unknown> = {}
    ): Promise<unknown> {
        const result = await options.externalCallHost.call(name, parameters);

        calls.push({
            name,
            parameters,
            result
        });

        return result.status === "ready" ? result.value : null;
    };

    const listCalls = function(): DialogRuntimeHarnessCall[] {
        return calls.map((call) => {
            return {
                name: call.name,
                parameters: { ...call.parameters },
                result: { ...call.result }
            };
        });
    };

    const getLastResult = function(): DialogExternalCallResult | null {
        const last = calls[calls.length - 1];
        return last ? { ...last.result } : null;
    };

    return {
        callExternal,
        supportsExternalCall,
        listCalls,
        getLastResult
    };
};

import {
    createEmptyProductDialogCommandResult,
    createProductDialogCommandResultFromStatus,
    readProductDialogCommandText
} from "./dialogCommandResult";
import {
    createDialogStateExternalCallResult,
    createEmptyDialogExternalCallResult,
    isDialogStateExternalCall
} from "./custom-js/dialogStateExternalCalls";


export interface DialogChannelAdapterBindings {
    getWorkingDirectory(): string;
    readVariableValues(input: unknown): Promise<unknown>;
    loadRuntimePackages(packages: unknown): Promise<void>;
    executeVisibleCommand(command: string): Promise<{ ok?: boolean } | null | undefined>;
    callExternal?(name: string, parameters: Record<string, unknown>): unknown;
    handleStateCall(name: string, parameters: unknown): unknown;
    readConsoleStateChips?(dataset: string): unknown[];
}

export interface DialogChannelAdapter {
    getWorkingDirectory(): string;
    readVariableValues(input: unknown): Promise<unknown>;
    executeDialog(input: unknown): Promise<unknown>;
    callExternal(input: unknown, args: unknown[]): unknown;
    readConsoleStateChips(input?: unknown): unknown[];
}

const readInput = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
};

export const createDialogChannelAdapter = function(
    bindings: DialogChannelAdapterBindings
): DialogChannelAdapter {
    return {
        getWorkingDirectory() {
            return bindings.getWorkingDirectory();
        },

        readVariableValues(input) {
            return bindings.readVariableValues(input);
        },

        async executeDialog(value) {
            const input = readInput(value);
            const command = readProductDialogCommandText(input);

            if (!command) {
                return createEmptyProductDialogCommandResult(command);
            }

            await bindings.loadRuntimePackages(input.dependencies || []);
            const result = await bindings.executeVisibleCommand(command);

            return createProductDialogCommandResultFromStatus(command, result);
        },

        callExternal(value, args) {
            const input = readInput(value);
            const name = String(input.name || args?.[0] || "");
            const parameters = input.parameters || args?.[1] || {};

            if (isDialogStateExternalCall(name)) {
                return createDialogStateExternalCallResult(
                    name,
                    bindings.handleStateCall(name, parameters)
                );
            }

            if (typeof bindings.callExternal === "function") {
                return bindings.callExternal(name, readInput(parameters));
            }

            return createEmptyDialogExternalCallResult(name);
        },

        readConsoleStateChips(input) {
            if (typeof bindings.readConsoleStateChips !== "function") {
                return [];
            }

            const inputRecord = readInput(input);
            const dataset = Array.isArray(input)
                ? String(input[0] || "")
                : String(inputRecord.dataset || input || "");

            return bindings.readConsoleStateChips(dataset);
        }
    };
};

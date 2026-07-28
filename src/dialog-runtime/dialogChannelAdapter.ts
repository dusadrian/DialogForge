import {
    createEmptyProductDialogCommandResult,
    createProductDialogCommandResultFromStatus,
    readProductDialogCommandText
} from "./dialogCommandResult";
import {
    createDialogImportFileResult,
    type DialogImportFileResult
} from "./dialogRuntimeIpc";
import {
    createDialogStateExternalCallResult,
    createEmptyDialogExternalCallResult,
    isDialogStateExternalCall
} from "./custom-js/dialogStateExternalCalls";


export interface DialogChannelAdapterBindings {
    getWorkingDirectory(): string;
    openImportFile(): Promise<unknown>;
    previewImportFile(input: unknown): Promise<unknown>;
    readVariableValues(input: unknown): Promise<unknown>;
    runActivity?<Result>(
        message: string,
        action: () => Promise<Result>
    ): Promise<Result>;
    loadRuntimePackages(packages: unknown): Promise<void>;
    executeVisibleCommand(command: string): Promise<{ ok?: boolean } | null | undefined>;
    callExternal?(name: string, parameters: Record<string, unknown>): unknown;
    handleStateCall(name: string, parameters: unknown): unknown;
    readConsoleStateChips?(dataset: string): unknown[];
}

export interface DialogChannelAdapter {
    getWorkingDirectory(): string;
    openImportFile(): Promise<DialogImportFileResult>;
    previewImportFile(input: unknown): Promise<unknown>;
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

        async openImportFile() {
            return createDialogImportFileResult(
                await bindings.openImportFile()
            );
        },

        async previewImportFile(input) {
            const readPreview = function(): Promise<unknown> {
                return bindings.previewImportFile(input);
            };

            if (typeof bindings.runActivity === "function") {
                return bindings.runActivity(
                    "Preparing import preview...",
                    readPreview
                );
            }

            return readPreview();
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

            const execute = async function(): Promise<{
                ok?: boolean;
            } | null | undefined> {
                await bindings.loadRuntimePackages(input.dependencies || []);

                return bindings.executeVisibleCommand(command);
            };
            const result = typeof bindings.runActivity === "function"
                ? await bindings.runActivity("Running dialog command...", execute)
                : await execute();

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

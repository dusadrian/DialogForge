import type {
    ScriptEditorDocumentState
} from "./scriptEditorIpc";
import {
    createScriptFragmentCheckResult
} from "./run/scriptFragmentCheck";
import {
    readScriptCodeBatchInput,
    runScriptCodeBatch
} from "./run/scriptCodeBatch";
import {
    createScriptEditorConfirmSaveResult,
    createUnsupportedScriptDirectoryResult,
    type ScriptDirectoryResult
} from "./files/scriptDirectoryResult";


export interface ScriptChannelAdapterBindings {
    ensureRuntimeReady(): Promise<boolean>;
    checkFragment(code: string): Promise<string>;
    executeVisibleCommand(command: string): Promise<unknown>;
    getDocument(): ScriptEditorDocumentState;
    saveFile(input: unknown, saveAs: boolean): Promise<unknown>;
    openFile(): Promise<unknown>;
}

export interface ScriptChannelAdapter {
    checkFragment(input: unknown): Promise<unknown>;
    runCodeBatch(input: unknown): Promise<unknown>;
    getDocument(): ScriptEditorDocumentState;
    saveFile(input: unknown, saveAs: boolean): Promise<unknown>;
    openFile(): Promise<unknown>;
    openFilePath(): null;
    listDirectory(): ScriptDirectoryResult;
    confirmSave(): { action: string };
}

const readInput = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
};

export const createScriptChannelAdapter = function(
    bindings: ScriptChannelAdapterBindings
): ScriptChannelAdapter {
    return {
        async checkFragment(value) {
            const input = readInput(value);

            return createScriptFragmentCheckResult({
                state: await bindings.checkFragment(String(input.code || ""))
            });
        },

        async runCodeBatch(value) {
            return runScriptCodeBatch(readScriptCodeBatchInput(value), {
                ensureRuntimeReady: bindings.ensureRuntimeReady,
                executeVisibleCommand: async function(request) {
                    await bindings.executeVisibleCommand(request.text);

                    return [];
                }
            });
        },

        getDocument() {
            return bindings.getDocument();
        },

        saveFile(input, saveAs) {
            return bindings.saveFile(input, saveAs);
        },

        openFile() {
            return bindings.openFile();
        },

        openFilePath() {
            return null;
        },

        listDirectory() {
            return createUnsupportedScriptDirectoryResult();
        },

        confirmSave() {
            return createScriptEditorConfirmSaveResult("save");
        }
    };
};

import type {
    ScriptEditorInitPayload,
    ScriptEditorLanguagePayload,
    ScriptEditorOpenFilePayload
} from "./scriptEditorIpcBindings";


export const createScriptEditorIpcController = function(
    options: {
        initialize(payload: ScriptEditorInitPayload): Promise<unknown> | unknown;
        changeLanguage(payload: ScriptEditorLanguagePayload): void;
        updateTerminalSettings(settings: Record<string, unknown>): void;
        requestSaveForClose(requestId: string): Promise<unknown> | unknown;
        insertCode(code: unknown): void;
        openFile(payload: ScriptEditorOpenFilePayload): void;
        runtimeChanged(): void;
    }
) {
    return {
        initialize: (payload: ScriptEditorInitPayload): void => {
            void options.initialize(payload);
        },
        changeLanguage: options.changeLanguage,
        updateTerminalSettings: options.updateTerminalSettings,
        requestSaveForClose: (requestId: string): void => {
            void options.requestSaveForClose(requestId);
        },
        insertCode: options.insertCode,
        openFile: options.openFile,
        runtimeChanged: options.runtimeChanged
    };
};

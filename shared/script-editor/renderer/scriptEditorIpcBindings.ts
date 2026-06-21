export interface ScriptEditorInitPayload {
    appPath?: unknown;
    languageNS?: unknown;
    terminalSettings?: Record<string, unknown>;
}


export interface ScriptEditorLanguagePayload {
    appPath: string;
    languageNS: string;
}


export interface ScriptEditorOpenFilePayload {
    filePath: string;
    content: string;
}


export interface ScriptEditorIpcBindings {
    initialize(payload: ScriptEditorInitPayload): void;
    changeLanguage(payload: ScriptEditorLanguagePayload): void;
    updateTerminalSettings(settings: Record<string, unknown>): void;
    requestSaveForClose(requestId: string): void;
    insertCode(code: unknown): void;
    openFile(payload: ScriptEditorOpenFilePayload): void;
    runtimeChanged(): void;
}


export interface ScriptEditorIpcBridge {
    onInit(callback: (payload: ScriptEditorInitPayload) => void): void;
    onLanguageChanged(callback: (payload: ScriptEditorLanguagePayload) => void): void;
    onTerminalSettingsUpdated(callback: (settings: Record<string, unknown>) => void): void;
    onRequestSaveForClose(callback: (requestId: string) => void): void;
    onInsertCode(callback: (code: unknown) => void): void;
    onOpenFile(callback: (payload: ScriptEditorOpenFilePayload) => void): void;
    onRuntimeExecuted(callback: () => void): void;
    onCommandBoundary(callback: () => void): void;
    onSessionState(callback: (phase: string) => void): void;
}


const asRecord = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object"
        ? value as Record<string, unknown>
        : {};
};


export const bindScriptEditorIpc = function(
    bridge: ScriptEditorIpcBridge,
    bindings: ScriptEditorIpcBindings
): void {
    bridge.onInit((value) => {
        bindings.initialize(asRecord(value) as ScriptEditorInitPayload);
    });

    bridge.onLanguageChanged((value) => {
        bindings.changeLanguage(value);
    });

    bridge.onTerminalSettingsUpdated((value) => {
        bindings.updateTerminalSettings(asRecord(value));
    });

    bridge.onRequestSaveForClose((requestId) => {
        if (requestId) {
            bindings.requestSaveForClose(requestId);
        }
    });

    bridge.onInsertCode((value) => {
        bindings.insertCode(value);
    });

    bridge.onOpenFile((value) => {
        bindings.openFile(value);
    });

    bridge.onRuntimeExecuted(() => {
        bindings.runtimeChanged();
    });

    bridge.onCommandBoundary(() => {
        bindings.runtimeChanged();
    });

    bridge.onSessionState((phase) => {
        if (phase === "ready" || phase === "idle" || phase === "running") {
            bindings.runtimeChanged();
        }
    });
};

export interface ScriptEditorDirtyState {
    dirty: boolean;
    filePath: string;
    content: string;
}


export interface SelectedScriptFile {
    filePath: string;
    content: string;
}


export interface ScriptEditorRendererTransport {
    publishDirtyState(state: ScriptEditorDirtyState): void;
    chooseScriptFile(): Promise<SelectedScriptFile | null>;
    publishReady(): void;
}


export interface ScriptEditorTransportBridge {
    publishDirtyState(state: ScriptEditorDirtyState): void;
    chooseScriptFile(): Promise<SelectedScriptFile | null>;
    publishReady(): void;
}


export const createScriptEditorRendererTransport = function(
    bridge: ScriptEditorTransportBridge
): ScriptEditorRendererTransport {
    return {
        publishDirtyState: (state) => {
            try {
                bridge.publishDirtyState({
                    dirty: Boolean(state.dirty),
                    filePath: String(state.filePath || ""),
                    content: String(state.content || "")
                });
            } catch {}
        },
        chooseScriptFile: async () => {
            try {
                const response = await bridge.chooseScriptFile();

                if (!response) {
                    return null;
                }

                return {
                    filePath: String(response.filePath || ""),
                    content: String(response.content || "")
                };
            } catch {
                return null;
            }
        },
        publishReady: () => {
            try {
                bridge.publishReady();
            } catch {}
        }
    };
};

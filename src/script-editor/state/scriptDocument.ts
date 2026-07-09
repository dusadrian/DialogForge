import type * as Monaco from "monaco-editor";


export interface ScriptDocument {
    id: string;
    model: Monaco.editor.ITextModel;
    filePath: string;
    dirty: boolean;
    scrollTop: number;
    muteChanges: boolean;
    disposeChange(): void;
}


export interface ScriptDocumentOptions {
    filePath?: string;
    content?: string;
    contentChanged(document: ScriptDocument): void;
}


const createDocumentId = function(): string {
    return `tab-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
};


export const setScriptDocumentContent = function(
    document: ScriptDocument,
    content: string,
    dirty = false
): void {
    document.muteChanges = true;
    document.model.setValue(String(content || ""));
    document.muteChanges = false;
    document.dirty = dirty;
};


export const createScriptDocument = function(
    monaco: typeof Monaco,
    options: ScriptDocumentOptions
): ScriptDocument {
    const model = monaco.editor.createModel("", "r");
    const document: ScriptDocument = {
        id: createDocumentId(),
        model,
        filePath: String(options.filePath || ""),
        dirty: false,
        scrollTop: 0,
        muteChanges: false,
        disposeChange: () => {}
    };
    const changeDisposable = model.onDidChangeContent(() => {
        if (document.muteChanges) {
            return;
        }

        document.dirty = true;
        options.contentChanged(document);
    });

    document.disposeChange = function(): void {
        changeDisposable.dispose();
    };
    setScriptDocumentContent(
        document,
        String(options.content || ""),
        false
    );
    return document;
};


export const disposeScriptDocument = function(
    document: ScriptDocument
): void {
    try {
        document.disposeChange();
    } catch {}

    try {
        document.model.dispose();
    } catch {}
};

import type * as Monaco from "monaco-editor";
import type {
    LiveScriptEditFrame,
    LiveScriptTextEdit
} from "../collaboration/liveScriptProtocol";
import {
    setScriptDocumentContent,
    type ScriptDocument
} from "../state/scriptDocument";


export const liveScriptEditsFromMonacoChange = function(
    event: Monaco.editor.IModelContentChangedEvent
): LiveScriptTextEdit[] {
    return event.changes.map((change) => ({
        range: {
            startLineNumber: change.range.startLineNumber,
            startColumn: change.range.startColumn,
            endLineNumber: change.range.endLineNumber,
            endColumn: change.range.endColumn
        },
        rangeOffset: change.rangeOffset,
        rangeLength: change.rangeLength,
        text: change.text
    })).sort((left, right) => left.rangeOffset - right.rangeOffset);
};


const captureActiveViewState = function(
    editor: Monaco.editor.IStandaloneCodeEditor | null,
    document: ScriptDocument
): Monaco.editor.ICodeEditorViewState | null {
    if (!editor || editor.getModel() !== document.model) {
        return null;
    }

    return editor.saveViewState();
};


const restoreActiveViewState = function(
    editor: Monaco.editor.IStandaloneCodeEditor | null,
    document: ScriptDocument,
    viewState: Monaco.editor.ICodeEditorViewState | null
): void {
    if (!editor || !viewState || editor.getModel() !== document.model) {
        return;
    }

    editor.restoreViewState(viewState);
};


export const applyLiveScriptEditsToDocument = function(
    monaco: typeof Monaco,
    editor: Monaco.editor.IStandaloneCodeEditor | null,
    document: ScriptDocument,
    frame: LiveScriptEditFrame
): void {
    const viewState = captureActiveViewState(editor, document);
    const edits: Monaco.editor.IIdentifiedSingleEditOperation[] =
        frame.payload.edits.map((edit) => ({
            range: new monaco.Range(
                edit.range.startLineNumber,
                edit.range.startColumn,
                edit.range.endLineNumber,
                edit.range.endColumn
            ),
            text: edit.text,
            forceMoveMarkers: true
        }));

    document.muteChanges = true;
    try {
        document.model.applyEdits(edits, false);
    }
    finally {
        document.muteChanges = false;
    }

    document.dirty = false;
    restoreActiveViewState(editor, document, viewState);
};


export const replaceLiveScriptDocumentContent = function(
    editor: Monaco.editor.IStandaloneCodeEditor | null,
    document: ScriptDocument,
    content: string
): void {
    const viewState = captureActiveViewState(editor, document);
    setScriptDocumentContent(document, content, false);
    restoreActiveViewState(editor, document, viewState);
};

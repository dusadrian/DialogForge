import type * as Monaco from "monaco-editor";
import type { ScriptDocument } from "../state/scriptDocument";


export interface PendingScriptFile {
    filePath: string;
    content: string;
}


export interface ScriptEditorInsertionControllerOptions {
    getMonaco: () => typeof Monaco | null;
    getEditor: () => Monaco.editor.IStandaloneCodeEditor | null;
    getActiveDocument: () => ScriptDocument | null;
    createDocument: () => ScriptDocument;
    activateDocument: (tabId: string) => void;
    openFile: (
        filePath: string,
        content: string,
        preferCurrent?: boolean
    ) => Promise<void>;
}


export interface ScriptEditorInsertionController {
    insertCode(rawCode: unknown): void;
    openFile(file: PendingScriptFile): void;
    readClipboardText(): Promise<string>;
    flushPending(): void;
}


const normalizeInsertedCode = function(value: unknown): string {
    return String(value || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
};


export const createScriptEditorInsertionController = function(
    options: ScriptEditorInsertionControllerOptions
): ScriptEditorInsertionController {
    const pendingCodes: string[] = [];
    const pendingFiles: PendingScriptFile[] = [];

    const insertCode = function(rawCode: unknown): void {
        const text = normalizeInsertedCode(rawCode);

        if (!text) {
            return;
        }

        const editor = options.getEditor();
        const monaco = options.getMonaco();

        if (!editor || !monaco) {
            pendingCodes.push(text);
            return;
        }

        let active = options.getActiveDocument();

        if (!active) {
            active = options.createDocument();
        }

        options.activateDocument(active.id);

        const selection = editor.getSelection();
        const position = editor.getPosition() || {
            lineNumber: 1,
            column: 1
        };
        const range = selection || new monaco.Range(
            position.lineNumber,
            position.column,
            position.lineNumber,
            position.column
        );

        try {
            editor.executeEdits(
                "scriptEditor.insertCode",
                [{
                    range,
                    text,
                    forceMoveMarkers: true
                }]
            );
        } catch {
            const current = String(active.model?.getValue() || "");
            active.model?.setValue(`${current}${text}`);
        }

        editor.focus();
    };

    const openFile = function(file: PendingScriptFile): void {
        if (!options.getEditor() || !options.getMonaco()) {
            pendingFiles.push(file);
            return;
        }

        void options.openFile(
            file.filePath,
            file.content,
            true
        );
    };

    const readClipboardText = async function(): Promise<string> {
        try {
            if (navigator.clipboard?.readText) {
                const text = await navigator.clipboard.readText();

                if (typeof text === "string") {
                    return text;
                }
            }
        } catch {}

        return "";
    };

    const flushPending = function(): void {
        if (!options.getEditor() || !options.getMonaco()) {
            return;
        }

        const files = pendingFiles.splice(0, pendingFiles.length);
        const codes = pendingCodes.splice(0, pendingCodes.length);

        files.forEach((file) => {
            void options.openFile(
                file.filePath,
                file.content,
                true
            );
        });

        codes.forEach(insertCode);
    };

    return {
        insertCode,
        openFile,
        readClipboardText,
        flushPending
    };
};

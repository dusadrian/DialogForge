import type * as Monaco from "monaco-editor";


export interface ScriptMonacoTypography {
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
}


export interface ScriptMonacoEditorOptions {
    monaco: typeof Monaco;
    host: HTMLElement;
    theme: string;
    typography: ScriptMonacoTypography;
}


export const createScriptMonacoEditor = function(
    options: ScriptMonacoEditorOptions
): Monaco.editor.IStandaloneCodeEditor {
    const editor = options.monaco.editor.create(
        options.host,
        {
            model: null,
            language: "r",
            theme: options.theme,
            fontFamily: options.typography.fontFamily,
            fontSize: options.typography.fontSize,
            lineHeight: options.typography.lineHeight,
            fontLigatures: false,
            minimap: {
                enabled: false
            },
            scrollbar: {
                vertical: "auto",
                horizontal: "auto"
            },
            overviewRulerLanes: 0,
            automaticLayout: true,
            glyphMargin: false,
            lineNumbers: "on",
            lineDecorationsWidth: "1.0ch",
            renderLineHighlight: "none",
            overviewRulerBorder: false,
            renderWhitespace: "selection",
            scrollBeyondLastLine: false,
            tabSize: 2,
            insertSpaces: true,
            contextmenu: false,
            padding: {
                top: 0,
                bottom: 0
            },
            fixedOverflowWidgets: true
        }
    );

    try {
        editor.updateOptions({
            cursorStyle: "line",
            cursorBlinking: "blink",
            fontLigatures: false,
            bracketPairColorization: {
                enabled: false
            }
        });
    } catch {}

    return editor;
};

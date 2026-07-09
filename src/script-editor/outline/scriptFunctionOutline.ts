export interface ScriptFunctionSymbol {
    name: string;
    lineNumber: number;
    column: number;
    detail: string;
}


export interface ScriptTextModelReader {
    getLineCount(): number;
    getLineContent(lineNumber: number): string;
}


export type ParseScriptFunctionOutline = (
    model: ScriptTextModelReader
) => ScriptFunctionSymbol[];

import type * as Monaco from "monaco-editor";
import {
    parseRFunctionOutline,
    type ScriptFunctionSymbol
} from "../outline/rFunctionOutline";
import {
    removeScriptOutlinePopup,
    showScriptOutlinePopup
} from "./scriptOutlinePopup";
import type { ScriptDocument } from "../state/scriptDocument";


export interface ScriptOutlineControllerOptions {
    getEditor: () => Monaco.editor.IStandaloneCodeEditor | null;
    getActiveDocument: () => ScriptDocument | null;
    getButtonAnchor: () => HTMLButtonElement | null;
    getLineLabel: () => string;
    documentStateChanged: (hasDocument: boolean, symbolCount: number) => void;
}


export interface ScriptOutlineController {
    registerDocumentSymbolProvider: (monaco: typeof Monaco) => void;
    getActiveSymbols: () => ScriptFunctionSymbol[];
    close: () => void;
    refresh: () => void;
    scheduleRefresh: () => void;
    toggle: (event?: Event) => void;
}


export const createScriptOutlineController = function(
    options: ScriptOutlineControllerOptions
): ScriptOutlineController {
    let providerRegistered = false;
    let popup: HTMLDivElement | null = null;
    let updateTimer: ReturnType<typeof setTimeout> | null = null;

    const getActiveSymbols = function(): ScriptFunctionSymbol[] {
        const active = options.getActiveDocument();

        if (!active?.model) {
            return [];
        }

        try {
            return parseRFunctionOutline(active.model);
        } catch {
            return [];
        }
    };

    const close = function(): void {
        removeScriptOutlinePopup(popup);
        popup = null;
    };

    const refresh = function(): void {
        const active = options.getActiveDocument();
        const symbols = active ? getActiveSymbols() : [];

        options.documentStateChanged(Boolean(active), symbols.length);

        if (!symbols.length) {
            close();
        }
    };

    const scheduleRefresh = function(): void {
        if (updateTimer) {
            clearTimeout(updateTimer);
        }

        updateTimer = setTimeout(() => {
            updateTimer = null;
            refresh();
        }, 120);
    };

    const jumpToSymbol = function(symbol: ScriptFunctionSymbol): void {
        const editor = options.getEditor();

        try {
            editor?.setPosition({
                lineNumber: symbol.lineNumber,
                column: symbol.column
            });
            editor?.revealPositionInCenter({
                lineNumber: symbol.lineNumber,
                column: symbol.column
            });
            editor?.focus();
        } catch {}

        close();
    };

    const show = function(): void {
        const anchor = options.getButtonAnchor();
        const symbols = getActiveSymbols();

        if (!anchor || !symbols.length) {
            return;
        }

        close();
        popup = showScriptOutlinePopup({
            anchor,
            symbols,
            lineLabel: options.getLineLabel(),
            select: jumpToSymbol
        });
    };

    const toggle = function(event?: Event): void {
        try {
            event?.stopPropagation();
        } catch {}

        if (popup) {
            close();
            return;
        }

        show();
    };

    const registerDocumentSymbolProvider = function(
        monaco: typeof Monaco
    ): void {
        if (
            providerRegistered
            || !monaco.languages?.registerDocumentSymbolProvider
        ) {
            return;
        }

        providerRegistered = true;

        try {
            monaco.languages.registerDocumentSymbolProvider("r", {
                provideDocumentSymbols(model: Monaco.editor.ITextModel) {
                    return parseRFunctionOutline(model).map((symbol) => {
                        const lineMaxColumn = Math.max(
                            1,
                            Number(
                                model.getLineMaxColumn(symbol.lineNumber)
                                || 1
                            )
                        );
                        const range = new monaco.Range(
                            symbol.lineNumber,
                            symbol.column,
                            symbol.lineNumber,
                            lineMaxColumn
                        );

                        return {
                            name: symbol.name,
                            detail: symbol.detail,
                            kind: monaco.languages.SymbolKind.Function,
                            tags: [],
                            range,
                            selectionRange: range,
                            children: []
                        };
                    });
                }
            });
        } catch {}
    };

    return {
        registerDocumentSymbolProvider,
        getActiveSymbols,
        close,
        refresh,
        scheduleRefresh,
        toggle
    };
};

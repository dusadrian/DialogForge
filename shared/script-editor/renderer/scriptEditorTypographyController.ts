import type * as Monaco from "monaco-editor";
import {
    CONSOLE_FONT_FAMILY,
    CONSOLE_FONT_SIZE,
    normalizeScriptEditorTypography
} from "../../console/consoleTypography";
import type {
    ScriptMonacoTypography
} from "./scriptMonacoEditor";


export interface ScriptEditorTypographyController {
    initialize(
        settings?: Record<string, unknown> | null
    ): ScriptMonacoTypography;
    update(
        editor: Monaco.editor.IStandaloneCodeEditor | null,
        settings?: Record<string, unknown> | null
    ): void;
}


const DEFAULT_SCRIPT_EDITOR_SETTINGS: Record<string, unknown> = {
    fontFamily: CONSOLE_FONT_FAMILY,
    fontSize: CONSOLE_FONT_SIZE,
    cursorStyle: "bar",
    cursorBlink: true,
    selectionBackground: "rgba(86, 156, 214, 0.42)",
    startQuiet: true,
    inputMode: "console",
    showFullErrorContext: false
};


export const createScriptEditorTypographyController = function():
ScriptEditorTypographyController {
    let currentSettings = {
        ...DEFAULT_SCRIPT_EDITOR_SETTINGS
    };

    const initialize = function(
        settings?: Record<string, unknown> | null
    ): ScriptMonacoTypography {
        currentSettings = {
            ...currentSettings,
            ...(settings || {})
        };

        return normalizeScriptEditorTypography({
            fontFamily: currentSettings.fontFamily,
            fontSize: currentSettings.fontSize
        });
    };

    const update = function(
        editor: Monaco.editor.IStandaloneCodeEditor | null,
        settings?: Record<string, unknown> | null
    ): void {
        const raw = settings || {};
        const typography = normalizeScriptEditorTypography({
            fontFamily:
                raw.fontFamily
                || currentSettings.fontFamily,
            fontSize: CONSOLE_FONT_SIZE
        });

        currentSettings = {
            ...currentSettings,
            ...raw,
            fontFamily: typography.fontFamily,
            fontSize: typography.fontSize
        };

        try {
            editor?.updateOptions({
                fontFamily: typography.fontFamily,
                fontSize: typography.fontSize,
                lineHeight: typography.lineHeight
            });
        } catch {}
    };

    return {
        initialize,
        update
    };
};

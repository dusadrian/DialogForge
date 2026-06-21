export const CONSOLE_FONT_FAMILY = "\"Dialog Mono\", monospace";
export const CONSOLE_FONT_SIZE = 13;
export const CONSOLE_LINE_HEIGHT = 20;


export const clampConsoleFontSize = function(value: unknown): number {
    const n = Number(value);

    if (!Number.isFinite(n)) {
        return CONSOLE_FONT_SIZE;
    }

    return Math.max(8, Math.min(36, Math.round(n)));
};

export const computeConsoleLineHeight = function(fontSize: unknown): number {
    const safe = clampConsoleFontSize(fontSize);

    return Math.max(14, Math.round(CONSOLE_LINE_HEIGHT * (safe / CONSOLE_FONT_SIZE)));
};


export const normalizeConsoleTypography = function(raw?: { fontFamily?: unknown; fontSize?: unknown } | null) {
    const fontSize = clampConsoleFontSize(raw?.fontSize);
    const fontFamily = String(raw?.fontFamily || "").trim() || CONSOLE_FONT_FAMILY;

    return {
        fontFamily,
        fontSize,
        lineHeight: computeConsoleLineHeight(fontSize)
    };
};


export const normalizeScriptEditorTypography = function(
    raw?: { fontFamily?: unknown; fontSize?: unknown } | null
) {
    return normalizeConsoleTypography(raw);
};

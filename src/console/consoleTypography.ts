export const CONSOLE_FONT_FAMILY = "\"Dialog Mono\", monospace";
export const CONSOLE_FONT_SIZE = 13;
export const CONSOLE_LINE_HEIGHT = 20;

export interface ConsoleEditorSettings {
    fontFamily?: unknown;
    fontSize?: unknown;
    cursorStyle?: unknown;
    cursorBlink?: unknown;
    selectionBackground?: unknown;
}


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

export const normalizeConsoleCursorStyle = function(value: unknown): "line" | "block" | "underline" {
    const normalized = String(value || "").trim().toLowerCase();

    if (normalized === "block") {
        return "block";
    }

    if (normalized === "underline") {
        return "underline";
    }

    return "line";
};

export const normalizeConsoleCursorBlinking = function(value: unknown): "blink" | "solid" {
    return value === false || String(value).toLowerCase() === "false"
        ? "solid"
        : "blink";
};

export const normalizeConsoleSelectionColor = function(value: unknown): string {
    const normalized = String(value || "").trim();

    if (/^#[0-9a-f]{6}$/i.test(normalized)) {
        return normalized.toUpperCase();
    }

    return "#BBD8FF";
};

export const normalizeConsoleEditorSettings = function(
    raw?: ConsoleEditorSettings | null
) {
    const typography = normalizeConsoleTypography(raw);

    return {
        ...typography,
        cursorStyle: normalizeConsoleCursorStyle(raw?.cursorStyle),
        cursorBlinking: normalizeConsoleCursorBlinking(raw?.cursorBlink),
        selectionBackground: normalizeConsoleSelectionColor(raw?.selectionBackground)
    };
};


export const normalizeScriptEditorTypography = function(
    raw?: { fontFamily?: unknown; fontSize?: unknown } | null
) {
    return normalizeConsoleTypography(raw);
};

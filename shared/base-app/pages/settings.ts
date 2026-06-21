type SettingsPayload = {
    settings?: Record<string, unknown>;
    locales?: Array<{ code: string; label: string }>;
    strings?: Record<string, string>;
};


const consoleFontFamily = [
    "'Liberation Mono'",
    "'JetBrains Mono'",
    "'IBM Plex Mono'",
    "'Roboto Mono'",
    "Consolas",
    "Monaco",
    "monospace"
].join(", ");

const terminalDefaults = {
    fontFamily: consoleFontFamily,
    cursorStyle: "bar",
    cursorBlink: true,
    selectionBackground: "rgba(86, 156, 214, 0.42)",
    startQuiet: true,
    inputMode: "console",
    showFullErrorContext: false
};

const fontOptions = [
    "Liberation Mono",
    "JetBrains Mono",
    "IBM Plex Mono",
    "Roboto Mono",
    "Consolas",
    "Monaco",
    "Courier New",
    "Fira Code"
];

const cursorOptions = ["bar", "block", "underline"];
const booleanOptions = ["true", "false"];
const selectionOptions = [
    "rgba(86, 156, 214, 0.42)",
    "rgba(90, 140, 90, 0.42)",
    "rgba(170, 140, 80, 0.42)",
    "rgba(150, 120, 180, 0.42)"
];


const byId = function<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);

    if (!element) {
        throw new Error(`Missing settings element: #${id}`);
    }

    return element as T;
};


const setOptions = function(
    element: HTMLElement,
    options: Array<string | { value: string; label: string }>
): void {
    const normalized = options.map((option) => {
        if (typeof option === "string") {
            return {
                value: option,
                label: option
            };
        }

        return option;
    });
    const customSetter = (element as HTMLElement & {
        setOptions?: (values: Array<{ value: string; label: string }>) => void;
    }).setOptions;

    if (typeof customSetter === "function") {
        customSetter.call(element, normalized);
        return;
    }

    const select = element as HTMLSelectElement;

    select.replaceChildren(...normalized.map((option) => {
        const node = document.createElement("option");

        node.value = option.value;
        node.textContent = option.label;

        return node;
    }));
};


const readValue = function(element: HTMLElement): string {
    return String((element as HTMLElement & { value?: unknown }).value ?? "");
};


const writeValue = function(element: HTMLElement, value: unknown): void {
    (element as HTMLElement & { value: string }).value = String(value ?? "");
};


const readChecked = function(element: HTMLElement): boolean {
    return Boolean((element as HTMLElement & { checked?: unknown }).checked);
};


const writeChecked = function(element: HTMLElement, value: unknown): void {
    (element as HTMLElement & { checked: boolean }).checked = Boolean(value);
};


const normalizeFontChoice = function(value: unknown): string {
    const current = String(value || "").replace(/["']/g, "").toLowerCase();

    return fontOptions.find((option) => {
        return current.includes(option.toLowerCase());
    }) || "Liberation Mono";
};


const fontStack = function(value: string): string {
    if (value === "Courier New") {
        return '"Courier New", monospace';
    }

    if (value === "Consolas" || value === "Monaco") {
        return `${value}, monospace`;
    }

    if (value === "Fira Code") {
        return '"Fira Code", monospace';
    }

    return consoleFontFamily;
};


const translate = function(strings: Record<string, string>, key: string): string {
    return String(strings[key] || key);
};


const applyText = function(strings: Record<string, string>): void {
    byId<HTMLHeadingElement>("settingsTitle").textContent = translate(strings, "Settings");
    byId<HTMLLabelElement>("labelLanguage").textContent = translate(strings, "Language");
    byId<HTMLLabelElement>("labelTerminalFont").textContent = translate(strings, "Terminal Font");
    byId<HTMLLabelElement>("labelTerminalCursor").textContent = translate(strings, "Terminal Cursor");
    byId<HTMLLabelElement>("labelTerminalCursorBlink").textContent = translate(strings, "Terminal Cursor Blink");
    byId<HTMLLabelElement>("labelTerminalSelectionColor").textContent = translate(strings, "Terminal Selection Color");
    byId<HTMLLabelElement>("labelTerminalQuiet").textContent = translate(strings, "Start R quietly");
    byId<HTMLLabelElement>("labelTerminalErrorContext").textContent = translate(strings, "Show full R error context");
    byId<HTMLLabelElement>("labelTerminalInputMode").textContent = translate(strings, "Input Mode");
    byId<HTMLLabelElement>("labelAuthoringFeatures").textContent = translate(strings, "Enable Authoring Features");
    byId<HTMLButtonElement>("saveBtn").textContent = translate(strings, "Save");
    byId<HTMLButtonElement>("cancelBtn").textContent = translate(strings, "Cancel");
};


const renderSettings = function(payload: SettingsPayload): void {
    const settings = payload.settings || {};
    const terminalSettings = Object.assign(
        {},
        terminalDefaults,
        settings.terminalSettings && typeof settings.terminalSettings === "object"
            ? settings.terminalSettings
            : {}
    ) as typeof terminalDefaults;
    const locales = Array.isArray(payload.locales) && payload.locales.length > 0
        ? payload.locales
        : [{ code: "en_US", label: "English (United States)" }];

    applyText(payload.strings || {});

    const language = byId<HTMLElement>("defaultLanguage");
    const terminalFont = byId<HTMLElement>("terminalFont");
    const cursorStyle = byId<HTMLElement>("terminalCursorStyle");
    const cursorBlink = byId<HTMLElement>("terminalCursorBlink");
    const selectionColor = byId<HTMLElement>("terminalSelectionColor");
    const terminalQuiet = byId<HTMLElement>("terminalQuiet");
    const errorContext = byId<HTMLElement>("terminalErrorContext");
    const inputMode = byId<HTMLElement>("terminalInputMode");
    const authoring = byId<HTMLElement>("enableAuthoringFeatures");

    setOptions(language, locales.map((locale) => {
        return {
            value: locale.code,
            label: locale.label
        };
    }));
    setOptions(terminalFont, fontOptions);
    setOptions(cursorStyle, cursorOptions);
    setOptions(cursorBlink, booleanOptions);
    setOptions(selectionColor, selectionOptions);
    setOptions(errorContext, booleanOptions);
    setOptions(inputMode, ["console", "terminal"]);

    writeValue(language, settings.defaultLanguage || "en_US");
    writeValue(terminalFont, normalizeFontChoice(terminalSettings.fontFamily));
    writeValue(cursorStyle, terminalSettings.cursorStyle);
    writeValue(cursorBlink, String(Boolean(terminalSettings.cursorBlink)));
    writeValue(selectionColor, terminalSettings.selectionBackground);
    writeChecked(terminalQuiet, terminalSettings.startQuiet !== false);
    writeValue(errorContext, String(Boolean(terminalSettings.showFullErrorContext)));
    writeValue(inputMode, terminalSettings.inputMode === "terminal" ? "terminal" : "console");
    writeChecked(authoring, Boolean(settings.enableAuthoringFeatures));

    byId<HTMLButtonElement>("saveBtn").onclick = function(): void {
        window.dialogForge.settings.save({
            defaultLanguage: readValue(language) || "en_US",
            terminalSettings: {
                fontFamily: fontStack(readValue(terminalFont)),
                cursorStyle: readValue(cursorStyle) || terminalDefaults.cursorStyle,
                cursorBlink: readValue(cursorBlink) === "true",
                selectionBackground: readValue(selectionColor) || terminalDefaults.selectionBackground,
                startQuiet: readChecked(terminalQuiet),
                inputMode: readValue(inputMode) === "terminal" ? "terminal" : "console",
                showFullErrorContext: readValue(errorContext) === "true"
            },
            enableAuthoringFeatures: readChecked(authoring)
        });
    };

    byId<HTMLButtonElement>("cancelBtn").onclick = function(): void {
        window.close();
    };
};


window.dialogForge.settings.onLoaded(function(payload: unknown): void {
    renderSettings(payload as SettingsPayload);
});

window.dialogForge.settings.onSaved(function(): void {
    window.close();
});

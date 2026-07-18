type SettingsPayload = {
    settings?: Record<string, unknown>;
    factorySettings?: Record<string, unknown>;
    locales?: Array<{ code: string; label: string }>;
    runtimeProviders?: Array<{ id: string; label?: string }>;
    runtimeLocationStates?: Record<string, RuntimeLocationState>;
    selectedRuntimeProvider?: string;
    strings?: Record<string, string>;
};

type RuntimeLocationState = {
    providerId?: string;
    configurable?: boolean;
    configuredPath?: string;
    resolvedPath?: string;
    source?: "configured" | "discovered" | "invalid" | "unavailable";
    message?: string;
};

type IroColor = {
    hexString: string;
    set: (value: string) => void;
};

type IroColorPicker = {
    color: IroColor;
    on: (eventName: string, handler: (color: IroColor) => void) => void;
};

type IroModule = {
    ColorPicker: new (
        host: HTMLElement,
        options: Record<string, unknown>
    ) => IroColorPicker;
    ui: {
        Box: unknown;
        Slider: unknown;
    };
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const iro = require("@jaames/iro") as IroModule;


const consoleFontFamily = '"Dialog Mono", monospace';

const terminalDefaults = {
    fontFamily: consoleFontFamily,
    cursorStyle: "bar",
    cursorBlink: true,
    selectionBackground: "#BBD8FF",
    startQuiet: false,
    inputMode: "console",
    showFullErrorContext: false
};

const fontOptions = [
    "Liberation Mono",
    "JetBrains Mono",
    "Fira Code",
    "Source Code Pro"
];

const cursorOptions = ["bar", "block", "underline"];


const isRecord = function(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
};


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
    if (value === "Liberation Mono") {
        return consoleFontFamily;
    }

    if (value === "JetBrains Mono") {
        return '"JetBrains Mono", "Dialog Mono", monospace';
    }

    if (value === "Fira Code") {
        return '"Fira Code", "Dialog Mono", monospace';
    }

    if (value === "Source Code Pro") {
        return '"Source Code Pro", "Dialog Mono", monospace';
    }

    return consoleFontFamily;
};


const connectCheckboxLabel = function(labelId: string, checkbox: HTMLElement): void {
    const label = byId<HTMLLabelElement>(labelId);

    label.onclick = function(): void {
        writeChecked(checkbox, !readChecked(checkbox));
    };
};

const colorComponentToHex = function(value: number): string {
    return Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, "0")
        .toUpperCase();
};

const normalizeHexColor = function(value: unknown): string {
    const raw = String(value || "").trim();
    const shortHex = raw.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);

    if (shortHex) {
        return (
            "#" +
            shortHex[1] + shortHex[1] +
            shortHex[2] + shortHex[2] +
            shortHex[3] + shortHex[3]
        ).toUpperCase();
    }

    if (/^#[0-9a-f]{6}$/i.test(raw)) {
        return raw.toUpperCase();
    }

    const rgba = raw.match(
        /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*[0-9.]+)?\s*\)$/i
    );

    if (rgba) {
        return (
            "#" +
            colorComponentToHex(Number(rgba[1])) +
            colorComponentToHex(Number(rgba[2])) +
            colorComponentToHex(Number(rgba[3]))
        );
    }

    return terminalDefaults.selectionBackground;
};

const updateColorSwatch = function(
    textInput: HTMLInputElement,
    swatch: HTMLButtonElement
): void {
    const color = normalizeHexColor(textInput.value);

    textInput.value = color;
    swatch.style.background = color;
};

const createColorPicker = function(
    textInput: HTMLInputElement,
    swatch: HTMLButtonElement,
    onColorChange: () => void
): void {
    document.querySelectorAll(".color-popover").forEach((element) => {
        element.remove();
    });

    const popover = document.createElement("div");
    const host = document.createElement("div");
    let suppressColorChange = false;

    popover.className = "color-popover";
    host.className = "color-picker-host";
    popover.appendChild(host);
    document.body.appendChild(popover);

    const picker = new iro.ColorPicker(host, {
        width: 250,
        color: normalizeHexColor(textInput.value),
        layoutDirection: "horizontal",
        layout: [
            {
                component: iro.ui.Box,
                options: {
                    borderWidth: 1
                }
            },
            {
                component: iro.ui.Slider,
                options: {
                    sliderType: "value",
                    layoutDirection: "vertical",
                    height: 180
                }
            },
            {
                component: iro.ui.Slider,
                options: {
                    sliderType: "hue",
                    layoutDirection: "vertical",
                    height: 180
                }
            }
        ]
    });

    const closePopover = function(): void {
        popover.style.display = "none";
    };
    const positionPopover = function(): void {
        const anchor = swatch.getBoundingClientRect();
        const padding = 8;
        const width = popover.offsetWidth;
        const height = popover.offsetHeight;
        const preferredLeft = anchor.right + padding;

        popover.style.left = `${Math.max(
            padding,
            Math.min(preferredLeft, window.innerWidth - width - padding)
        )}px`;
        popover.style.top = `${Math.max(
            padding,
            Math.min(anchor.top, window.innerHeight - height - padding)
        )}px`;
    };

    picker.on("color:change", function(color: IroColor): void {
        if (suppressColorChange) {
            return;
        }

        textInput.value = normalizeHexColor(color.hexString);
        swatch.style.background = textInput.value;
        onColorChange();
    });

    textInput.oninput = function(): void {
        if (!/^#[0-9a-f]{6}$/i.test(textInput.value)) {
            return;
        }

        const color = normalizeHexColor(textInput.value);
        swatch.style.background = color;
        picker.color.set(color);
        onColorChange();
    };
    textInput.onblur = function(): void {
        updateColorSwatch(textInput, swatch);
        picker.color.set(textInput.value);
        onColorChange();
    };
    swatch.onclick = function(): void {
        suppressColorChange = true;
        picker.color.set(normalizeHexColor(textInput.value));
        suppressColorChange = false;
        popover.style.display = "block";
        positionPopover();
    };

    document.addEventListener("mousedown", function(event: MouseEvent): void {
        const target = event.target as Node;

        if (!popover.contains(target) && !swatch.contains(target)) {
            closePopover();
        }
    }, true);
    document.addEventListener("keydown", function(event: KeyboardEvent): void {
        if (event.key === "Escape") {
            closePopover();
        }
    }, true);
};


const translate = function(strings: Record<string, string>, key: string): string {
    return String(strings[key] || key);
};


const applyText = function(strings: Record<string, string>): void {
    byId<HTMLHeadingElement>("settingsTitle").textContent = translate(strings, "Settings");
    byId<HTMLHeadingElement>("settingsGeneralTitle").textContent = translate(strings, "General");
    byId<HTMLHeadingElement>("settingsRuntimeTitle").textContent = translate(strings, "Runtime");
    byId<HTMLHeadingElement>("settingsConsoleTitle").textContent = translate(strings, "Console");
    byId<HTMLLabelElement>("labelLanguage").textContent = translate(strings, "Language");
    byId<HTMLLabelElement>("labelRuntimeProvider").textContent = translate(strings, "Runtime provider");
    byId<HTMLLabelElement>("labelDetectRuntimeAtStartup").textContent = translate(strings, "Detect runtime at startup");
    byId<HTMLLabelElement>("labelRuntimeLocation").textContent = translate(strings, "Runtime location");
    byId<HTMLButtonElement>("browseRuntimeLocation").textContent = translate(strings, "Browse");
    byId<HTMLSpanElement>("autoDetectRuntimeLocationLabel").textContent = translate(strings, "Rediscover");
    byId<HTMLLabelElement>("labelTerminalFont").textContent = translate(strings, "Console font");
    byId<HTMLLabelElement>("labelTerminalCursor").textContent = translate(strings, "Console cursor");
    byId<HTMLLabelElement>("labelTerminalCursorBlink").textContent = translate(strings, "Console cursor blink");
    byId<HTMLLabelElement>("labelTerminalSelectionColor").textContent = translate(strings, "Console selection color");
    byId<HTMLLabelElement>("labelTerminalQuiet").textContent = translate(strings, "Start runtime quietly");
    byId<HTMLLabelElement>("labelTerminalErrorContext").textContent = translate(strings, "Show full console error context");
    byId<HTMLLabelElement>("labelTerminalInputMode").textContent = translate(strings, "Input mode");
    byId<HTMLLabelElement>("labelAuthoringFeatures").textContent = translate(strings, "Enable authoring features");
    byId<HTMLLabelElement>("labelNotifyUpdates").textContent = translate(strings, "Notify me when updates are available");
    const colorPickerLabel = translate(strings, "Pick color");
    const colorPickerButton = byId<HTMLButtonElement>("terminalSelectionColorSwatch");

    colorPickerButton.title = colorPickerLabel;
    colorPickerButton.setAttribute("aria-label", colorPickerLabel);
    byId<HTMLButtonElement>("resetBtn").textContent = translate(strings, "Reset");
    byId<HTMLButtonElement>("saveBtn").textContent = translate(strings, "Save");
    byId<HTMLButtonElement>("cancelBtn").textContent = translate(strings, "Cancel");
};


const readRuntimeProviderOptions = function(
    payload: SettingsPayload,
    runtimeStartup: Record<string, unknown>
): Array<{ id: string; label?: string }> {
    if (Array.isArray(payload.runtimeProviders) && payload.runtimeProviders.length > 0) {
        return payload.runtimeProviders;
    }

    const providerId = String(
        payload.selectedRuntimeProvider ||
        runtimeStartup.providerId ||
        ""
    ).trim();

    return providerId
        ? [{ id: providerId, label: providerId }]
        : [];
};


let restartRuntimeAfterSave = false;


const renderSettings = function(payload: SettingsPayload): void {
    restartRuntimeAfterSave = false;
    const settings = payload.settings || {};
    const factorySettings = payload.factorySettings || {};
    const locales = Array.isArray(payload.locales) && payload.locales.length > 0
        ? payload.locales
        : [{ code: "en_US", label: "English (United States)" }];
    const runtimeStartup = isRecord(settings.runtimeStartup)
        ? settings.runtimeStartup
        : {};
    const savedRuntimeLocations = isRecord(settings.runtimeLocations)
        ? settings.runtimeLocations
        : {};
    const savedRuntimeDetection = isRecord(settings.runtimeDetectionAtStartup)
        ? settings.runtimeDetectionAtStartup
        : {};
    const draftRuntimeLocations: Record<string, string> = {};
    const draftRuntimeDetection: Record<string, boolean> = {};

    Object.entries(savedRuntimeLocations).forEach(([providerId, value]) => {
        draftRuntimeLocations[providerId] = String(value || "").trim();
    });
    Object.entries(savedRuntimeDetection).forEach(([providerId, value]) => {
        draftRuntimeDetection[providerId] = value !== false;
    });
    const runtimeLocationStates = isRecord(payload.runtimeLocationStates)
        ? payload.runtimeLocationStates as Record<string, RuntimeLocationState>
        : {};
    const visibleRuntimeProviders = readRuntimeProviderOptions(
        payload,
        runtimeStartup
    );
    const selectedRuntimeProvider = String(
        payload.selectedRuntimeProvider ||
        runtimeStartup.providerId ||
        visibleRuntimeProviders[0]?.id ||
        ""
    );

    applyText(payload.strings || {});

    const language = byId<HTMLElement>("defaultLanguage");
    const runtimeProvider = byId<HTMLElement>("runtimeProvider");
    const detectRuntimeAtStartup = byId<HTMLElement>("detectRuntimeAtStartup");
    const runtimeLocation = byId<HTMLInputElement>("runtimeLocation");
    const runtimeLocationStatus = byId<HTMLElement>("runtimeLocationStatus");
    const browseRuntimeLocation = byId<HTMLButtonElement>("browseRuntimeLocation");
    const autoDetectRuntimeLocation = byId<HTMLButtonElement>("autoDetectRuntimeLocation");
    const terminalFont = byId<HTMLElement>("terminalFont");
    const cursorStyle = byId<HTMLElement>("terminalCursorStyle");
    const cursorBlink = byId<HTMLElement>("terminalCursorBlink");
    const selectionColor = byId<HTMLInputElement>("terminalSelectionColor");
    const selectionColorSwatch = byId<HTMLButtonElement>("terminalSelectionColorSwatch");
    const terminalQuiet = byId<HTMLElement>("terminalQuiet");
    const errorContext = byId<HTMLElement>("terminalErrorContext");
    const inputMode = byId<HTMLElement>("terminalInputMode");
    const authoring = byId<HTMLElement>("enableAuthoringFeatures");
    const notifyUpdates = byId<HTMLElement>("notifyUpdates");
    const resetButton = byId<HTMLButtonElement>("resetBtn");
    const saveButton = byId<HTMLButtonElement>("saveBtn");
    const cancelButton = byId<HTMLButtonElement>("cancelBtn");

    setOptions(language, locales.map((locale) => {
        return {
            value: locale.code,
            label: locale.label
        };
    }));
    setOptions(runtimeProvider, visibleRuntimeProviders.map((provider) => {
        return {
            value: provider.id,
            label: provider.label || provider.id
        };
    }));

    const detectsRuntimeAtStartup = function(providerId: string): boolean {
        if (Object.prototype.hasOwnProperty.call(
            draftRuntimeDetection,
            providerId
        )) {
            return draftRuntimeDetection[providerId] !== false;
        }

        return !String(draftRuntimeLocations[providerId] || "").trim();
    };
    const renderRuntimeLocation = function(): void {
        const providerId = readValue(runtimeProvider) || selectedRuntimeProvider;
        const state = runtimeLocationStates[providerId] || {};
        const configuredPath = String(
            draftRuntimeLocations[providerId] || ""
        ).trim();
        const resolvedPath = String(state.resolvedPath || "").trim();
        const configurable = state.configurable === true;
        const automatic = detectsRuntimeAtStartup(providerId);

        writeChecked(detectRuntimeAtStartup, automatic);
        runtimeLocation.value = automatic
            ? resolvedPath
            : configuredPath || resolvedPath;
        runtimeLocation.title = runtimeLocation.value;
        runtimeLocation.disabled = !configurable || automatic;
        browseRuntimeLocation.disabled = !configurable;
        autoDetectRuntimeLocation.disabled = !configurable || !automatic;
        byId<HTMLSpanElement>("autoDetectRuntimeLocationLabel").textContent = translate(
            payload.strings || {},
            "Rediscover"
        );
        runtimeLocationStatus.textContent = automatic
            ? resolvedPath
                ? translate(payload.strings || {}, "Detected automatically")
                : String(
                    state.message
                    || translate(payload.strings || {}, "No runtime was found")
                )
            : configuredPath
                ? state.source === "invalid"
                ? translate(payload.strings || {}, "Configured location is not usable")
                : translate(payload.strings || {}, "Custom location")
                : translate(payload.strings || {}, "Choose a custom runtime location");
    };
    setOptions(terminalFont, fontOptions);
    setOptions(cursorStyle, cursorOptions);
    setOptions(inputMode, ["console", "terminal"]);

    const readDraft = function(): Record<string, unknown> {
        return {
            defaultLanguage: readValue(language) || "en_US",
            terminalSettings: {
                fontFamily: fontStack(readValue(terminalFont)),
                cursorStyle: readValue(cursorStyle) || terminalDefaults.cursorStyle,
                cursorBlink: readChecked(cursorBlink),
                selectionBackground: normalizeHexColor(readValue(selectionColor)),
                startQuiet: readChecked(terminalQuiet),
                inputMode: readValue(inputMode) === "terminal" ? "terminal" : "console",
                showFullErrorContext: readChecked(errorContext)
            },
            runtimeStartup: Object.assign({}, runtimeStartup, {
                providerId: readValue(runtimeProvider) || selectedRuntimeProvider
            }),
            runtimeLocations: Object.assign({}, draftRuntimeLocations),
            runtimeDetectionAtStartup: Object.assign(
                {},
                draftRuntimeDetection
            ),
            enableAuthoringFeatures: readChecked(authoring),
            notifyUpdates: readChecked(notifyUpdates)
        };
    };
    const writeDraft = function(source: Record<string, unknown>): void {
        const sourceTerminal = Object.assign(
            {},
            terminalDefaults,
            isRecord(source.terminalSettings) ? source.terminalSettings : {}
        ) as typeof terminalDefaults;
        const sourceRuntime = isRecord(source.runtimeStartup)
            ? source.runtimeStartup
            : {};
        const sourceRuntimeLocations = isRecord(source.runtimeLocations)
            ? source.runtimeLocations
            : {};
        const sourceRuntimeDetection = isRecord(source.runtimeDetectionAtStartup)
            ? source.runtimeDetectionAtStartup
            : {};

        Object.keys(draftRuntimeLocations).forEach((providerId) => {
            delete draftRuntimeLocations[providerId];
        });
        Object.entries(sourceRuntimeLocations).forEach(([providerId, value]) => {
            draftRuntimeLocations[providerId] = String(value || "").trim();
        });
        Object.keys(draftRuntimeDetection).forEach((providerId) => {
            delete draftRuntimeDetection[providerId];
        });
        Object.entries(sourceRuntimeDetection).forEach(([providerId, value]) => {
            draftRuntimeDetection[providerId] = value !== false;
        });

        [
            language,
            runtimeProvider,
            detectRuntimeAtStartup,
            terminalFont,
            cursorStyle,
            cursorBlink,
            terminalQuiet,
            errorContext,
            inputMode,
            authoring,
            notifyUpdates
        ].forEach((control) => {
            control.onchange = null;
        });
        selectionColor.oninput = null;
        selectionColor.onblur = null;

        writeValue(language, source.defaultLanguage || "en_US");
        writeValue(
            runtimeProvider,
            sourceRuntime.providerId || selectedRuntimeProvider
        );
        renderRuntimeLocation();
        writeValue(terminalFont, normalizeFontChoice(sourceTerminal.fontFamily));
        writeValue(cursorStyle, sourceTerminal.cursorStyle);
        writeChecked(cursorBlink, Boolean(sourceTerminal.cursorBlink));
        writeValue(
            selectionColor,
            normalizeHexColor(sourceTerminal.selectionBackground)
        );
        updateColorSwatch(selectionColor, selectionColorSwatch);
        writeChecked(terminalQuiet, sourceTerminal.startQuiet === true);
        writeChecked(
            errorContext,
            Boolean(sourceTerminal.showFullErrorContext)
        );
        writeValue(
            inputMode,
            sourceTerminal.inputMode === "terminal" ? "terminal" : "console"
        );
        writeChecked(authoring, Boolean(source.enableAuthoringFeatures));
        writeChecked(notifyUpdates, source.notifyUpdates !== false);
    };
    const previewDraft = function(): void {
        window.dialogForge.settings.preview(readDraft());
    };
    const connectPreview = function(control: HTMLElement): void {
        control.onchange = previewDraft;
    };
    const discoverRuntime = async function(providerId: string): Promise<boolean> {
        const previousState = runtimeLocationStates[providerId] || {};
        const previousResolvedPath = String(
            previousState.resolvedPath || ""
        ).trim();
        let result: RuntimeLocationState | null = null;

        autoDetectRuntimeLocation.disabled = true;
        runtimeLocationStatus.textContent = translate(
            payload.strings || {},
            "Searching for runtime..."
        );

        try {
            result = await window.dialogForge.settings
                .discoverRuntimeLocation({ providerId });
        }
        catch {
            result = null;
        }

        if (String(result?.resolvedPath || "").trim()) {
            runtimeLocationStates[providerId] = result as RuntimeLocationState;
            return true;
        }

        runtimeLocationStates[providerId] = previousState;
        renderRuntimeLocation();
        runtimeLocationStatus.textContent = translate(
            payload.strings || {},
            previousResolvedPath
                ? "No replacement runtime was found; current location retained"
                : "No runtime was found"
        );

        return false;
    };
    const applyRuntimeDetectionMode = async function(): Promise<void> {
        const providerId = readValue(runtimeProvider) || selectedRuntimeProvider;
        const automatic = readChecked(detectRuntimeAtStartup);

        restartRuntimeAfterSave = true;
        if (automatic) {
            const discovered = await discoverRuntime(providerId);

            if (!discovered) {
                draftRuntimeDetection[providerId] = false;
                writeChecked(detectRuntimeAtStartup, false);
                renderRuntimeLocation();
                return;
            }

            draftRuntimeDetection[providerId] = true;
        }
        else {
            draftRuntimeDetection[providerId] = false;
            if (!String(draftRuntimeLocations[providerId] || "").trim()) {
                draftRuntimeLocations[providerId] = String(
                    runtimeLocationStates[providerId]?.resolvedPath || ""
                ).trim();
            }
        }

        renderRuntimeLocation();
        previewDraft();
    };
    const connectRuntimeDetectionControls = function(): void {
        detectRuntimeAtStartup.onchange = function(): void {
            void applyRuntimeDetectionMode();
        };
        byId<HTMLLabelElement>("labelDetectRuntimeAtStartup").onclick = function(): void {
            writeChecked(
                detectRuntimeAtStartup,
                !readChecked(detectRuntimeAtStartup)
            );
            void applyRuntimeDetectionMode();
        };
    };

    runtimeProvider.onchange = function(): void {
        renderRuntimeLocation();
        previewDraft();
    };
    runtimeLocation.oninput = function(): void {
        const providerId = readValue(runtimeProvider) || selectedRuntimeProvider;

        restartRuntimeAfterSave = true;
        draftRuntimeLocations[providerId] = runtimeLocation.value.trim();
        runtimeLocation.title = runtimeLocation.value;
        autoDetectRuntimeLocation.disabled = !detectsRuntimeAtStartup(providerId);
        byId<HTMLSpanElement>("autoDetectRuntimeLocationLabel").textContent = translate(
            payload.strings || {},
            "Rediscover"
        );
        runtimeLocationStatus.textContent = translate(
            payload.strings || {},
            draftRuntimeLocations[providerId]
                ? "Custom location"
                : "Choose a custom runtime location"
        );
    };
    runtimeLocation.onchange = function(): void {
        const providerId = readValue(runtimeProvider) || selectedRuntimeProvider;

        if (!draftRuntimeLocations[providerId]) {
            renderRuntimeLocation();
        }
        previewDraft();
    };
    browseRuntimeLocation.onclick = async function(): Promise<void> {
        const providerId = readValue(runtimeProvider) || selectedRuntimeProvider;
        const result = await window.dialogForge.settings.chooseRuntimeLocation({
            providerId,
            currentPath: runtimeLocation.value
        });

        if (!result?.path) {
            return;
        }

        restartRuntimeAfterSave = true;
        draftRuntimeDetection[providerId] = false;
        draftRuntimeLocations[providerId] = result.path;
        writeChecked(detectRuntimeAtStartup, false);
        renderRuntimeLocation();
        previewDraft();
    };
    autoDetectRuntimeLocation.onclick = async function(): Promise<void> {
        const providerId = readValue(runtimeProvider) || selectedRuntimeProvider;

        if (await discoverRuntime(providerId)) {
            renderRuntimeLocation();
            previewDraft();
        }
    };

    writeDraft(settings);
    connectRuntimeDetectionControls();
    runtimeProvider.onchange = function(): void {
        renderRuntimeLocation();
        previewDraft();
    };
    connectCheckboxLabel("labelTerminalCursorBlink", cursorBlink);
    connectCheckboxLabel("labelTerminalQuiet", terminalQuiet);
    connectCheckboxLabel("labelTerminalErrorContext", errorContext);
    connectCheckboxLabel("labelAuthoringFeatures", authoring);
    connectCheckboxLabel("labelNotifyUpdates", notifyUpdates);
    [
        language,
        terminalFont,
        cursorStyle,
        cursorBlink,
        terminalQuiet,
        errorContext,
        inputMode,
        authoring,
        notifyUpdates
    ].forEach(connectPreview);
    createColorPicker(
        selectionColor,
        selectionColorSwatch,
        previewDraft
    );

    resetButton.onclick = function(): void {
        writeDraft(factorySettings);
        connectRuntimeDetectionControls();
        runtimeProvider.onchange = function(): void {
            renderRuntimeLocation();
            previewDraft();
        };
        [
            language,
            terminalFont,
            cursorStyle,
            cursorBlink,
            terminalQuiet,
            errorContext,
            inputMode,
            authoring,
            notifyUpdates
        ].forEach(connectPreview);
        previewDraft();
    };

    saveButton.onclick = function(): void {
        window.dialogForge.settings.save(readDraft());
    };

    cancelButton.onclick = function(): void {
        window.dialogForge.settings.cancelPreview();
        previewRollbackRequired = false;
        window.close();
    };
};


let previewRollbackRequired = true;

window.addEventListener("beforeunload", function(): void {
    if (previewRollbackRequired) {
        window.dialogForge.settings.cancelPreview();
    }
});


window.dialogForge.settings.onLoaded(function(payload: unknown): void {
    renderSettings(payload as SettingsPayload);
});

window.dialogForge.settings.onSaved(function(): void {
    const shouldRestartRuntime = restartRuntimeAfterSave;

    restartRuntimeAfterSave = false;
    previewRollbackRequired = false;
    if (shouldRestartRuntime) {
        void window.dialogForge.restartRuntime("restore").catch((error) => {
            console.error("SETTINGS-ERR runtime restart failed:", error);
        });
    }
    window.close();
});

import type {
    ApplicationSettings
} from "./applicationSettingsIpc";


const isRecord = function(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
};


export const defaultApplicationTerminalSettings = {
    fontFamily: "\"Dialog Mono\", monospace",
    cursorStyle: "bar",
    cursorBlink: true,
    selectionBackground: "#BBD8FF",
    startQuiet: false,
    inputMode: "console",
    showFullErrorContext: false
} as const;


export const createFactoryApplicationSettings = function(
    defaultRuntimeProvider: string
): ApplicationSettings {
    return {
        defaultLanguage: "en_US",
        terminalSettings: {
            ...defaultApplicationTerminalSettings
        },
        runtimeStartup: {
            providerId: String(defaultRuntimeProvider || "").trim()
        },
        enableAuthoringFeatures: false,
        notifyUpdates: true
    };
};


const mergeRuntimeStartup = function(
    current: ApplicationSettings,
    patch: ApplicationSettings,
    visibleRuntimeProviderIds: string[],
    defaultRuntimeProvider: string
): ApplicationSettings {
    if (!isRecord(patch.runtimeStartup)) {
        return patch;
    }

    const currentStartup = isRecord(current.runtimeStartup)
        ? current.runtimeStartup
        : {};
    const visibleProviders = visibleRuntimeProviderIds.map((providerId) => {
        return String(providerId || "").trim();
    }).filter(Boolean);
    const defaultProvider = String(defaultRuntimeProvider || "").trim();
    const requestedProvider = String(patch.runtimeStartup.providerId || "").trim();
    const currentProvider = String(currentStartup.providerId || "").trim();
    const providerId = visibleProviders.includes(requestedProvider)
        ? requestedProvider
        : visibleProviders.includes(currentProvider)
            ? currentProvider
            : visibleProviders[0] || defaultProvider;

    return Object.assign({}, patch, {
        runtimeStartup: Object.assign(
            {},
            currentStartup,
            patch.runtimeStartup,
            { providerId }
        )
    });
};


export const mergeApplicationSettings = function(
    current: ApplicationSettings,
    input: unknown,
    visibleRuntimeProviderIds: string[],
    defaultRuntimeProvider: string
): ApplicationSettings {
    const patch = isRecord(input) ? input : {};
    const runtimeSettings = mergeRuntimeStartup(
        current,
        patch,
        visibleRuntimeProviderIds,
        defaultRuntimeProvider
    );

    return Object.assign({}, current, runtimeSettings, {
        terminalSettings: Object.assign(
            {},
            isRecord(current.terminalSettings) ? current.terminalSettings : {},
            isRecord(runtimeSettings.terminalSettings)
                ? runtimeSettings.terminalSettings
                : {}
        )
    });
};


export const synchronizeApplicationSettingsLocale = function(
    current: ApplicationSettings,
    next: ApplicationSettings,
    input: unknown
): ApplicationSettings {
    if (!isRecord(input) || !Object.prototype.hasOwnProperty.call(
        input,
        "defaultLanguage"
    )) {
        return next;
    }

    const currentLocale = String(
        current.defaultLanguage || current.languageNS || "en_US"
    );
    const nextLocale = String(
        next.defaultLanguage || next.languageNS || currentLocale
    );

    return Object.assign({}, next, {
        languageNS: nextLocale
    });
};

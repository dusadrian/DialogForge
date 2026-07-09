type DatasetEditorI18n = {
    init(locale: string, appPath: string): void;
    setLocale(locale: string, appPath: string): void;
    t(key: string, context: unknown, appPath: string): string;
};


const readDirectTranslations = function(value: unknown): Record<string, string> {
    if (!value || typeof value !== "object") {
        return {};
    }

    const source = value as Record<string, unknown>;
    const translations: Record<string, string> = {};

    Object.keys(source).forEach((key) => {
        const text = source[key];

        if (typeof text === "string") {
            translations[key] = text;
        }
    });

    return translations;
};


export const createDatasetEditorLocalizationController = function(
    options: {
        i18n: DatasetEditorI18n;
        defaultAppPath: string;
    }
) {
    let appPath = String(options.defaultAppPath || "");
    let translate = function(key: string): string {
        return key;
    };

    const installTranslator = function(
        locale: unknown,
        nextAppPath: unknown,
        directTranslations?: unknown
    ): void {
        appPath = String(nextAppPath || appPath || options.defaultAppPath || "");
        const translations = readDirectTranslations(directTranslations);

        if (Object.keys(translations).length > 0) {
            translate = function(key: string): string {
                return translations[key] || key;
            };
            return;
        }

        try {
            options.i18n.setLocale(String(locale || "en_US"), appPath);
            translate = function(key: string): string {
                return options.i18n.t(key, undefined, appPath);
            };
        } catch {
            translate = function(key: string): string {
                return key;
            };
        }
    };

    const initialize = function(
        locale: unknown,
        nextAppPath: unknown,
        directTranslations?: unknown
    ): void {
        appPath = String(nextAppPath || appPath || options.defaultAppPath || "");
        const translations = readDirectTranslations(directTranslations);

        if (Object.keys(translations).length > 0) {
            translate = function(key: string): string {
                return translations[key] || key;
            };
            return;
        }

        try {
            options.i18n.init(String(locale || "en_US"), appPath);
            translate = function(key: string): string {
                return options.i18n.t(key, undefined, appPath);
            };
        } catch {
            translate = function(key: string): string {
                return key;
            };
        }
    };

    return {
        getAppPath: function(): string {
            return appPath;
        },
        initialize,
        setLanguage: installTranslator,
        translate: function(key: string): string {
            return translate(key);
        }
    };
};

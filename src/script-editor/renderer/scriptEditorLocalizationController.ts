interface ScriptEditorI18n {
    init(language: string, appPath: string): void;
    t(key: string, data: unknown, appPath: string): string;
}


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


export interface ScriptEditorLocalizationBindings {
    i18n: ScriptEditorI18n;
    getDefaultAppPath(): string;
    relabel(): void;
}


export const createScriptEditorLocalizationController = function(
    bindings: ScriptEditorLocalizationBindings
) {
    let appPath = bindings.getDefaultAppPath();
    let translate = function(key: string): string {
        return key;
    };

    const apply = function(
        language: string,
        nextAppPath?: string,
        directTranslations?: unknown
    ): void {
        appPath = String(
            nextAppPath || appPath || bindings.getDefaultAppPath()
        );
        const translations = readDirectTranslations(directTranslations);

        if (Object.keys(translations).length > 0) {
            translate = function(key: string): string {
                return translations[key] || key;
            };
            return;
        }

        bindings.i18n.init(String(language || "en_US"), appPath);
        translate = function(key: string): string {
            return bindings.i18n.t(key, undefined, appPath);
        };
    };

    return {
        initialize: function(
            language: string,
            nextAppPath?: string,
            directTranslations?: unknown
        ): void {
            try {
                apply(language, nextAppPath, directTranslations);
            } catch {
                // DialogR treats renderer localization as best effort.
            }
        },
        changeLanguage: function(
            language: string,
            nextAppPath?: string,
            directTranslations?: unknown
        ): void {
            try {
                apply(language, nextAppPath, directTranslations);
                bindings.relabel();
            } catch {
                // Keep the current labels if the language bundle is unavailable.
            }
        },
        translate: function(key: string): string {
            return translate(key);
        }
    };
};

interface ScriptEditorI18n {
    init(language: string, appPath: string): void;
    t(key: string, data: unknown, appPath: string): string;
}


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
        nextAppPath?: string
    ): void {
        appPath = String(
            nextAppPath || appPath || bindings.getDefaultAppPath()
        );
        bindings.i18n.init(String(language || "en_US"), appPath);
        translate = function(key: string): string {
            return bindings.i18n.t(key, undefined, appPath);
        };
    };

    return {
        initialize: function(
            language: string,
            nextAppPath?: string
        ): void {
            try {
                apply(language, nextAppPath);
            } catch {
                // DialogR treats renderer localization as best effort.
            }
        },
        changeLanguage: function(
            language: string,
            nextAppPath?: string
        ): void {
            try {
                apply(language, nextAppPath);
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

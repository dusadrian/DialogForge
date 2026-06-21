type DatasetEditorI18n = {
    init(locale: string, appPath: string): void;
    setLocale(locale: string, appPath: string): void;
    t(key: string, context: unknown, appPath: string): string;
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

    const installTranslator = function(locale: unknown, nextAppPath: unknown): void {
        appPath = String(nextAppPath || appPath || options.defaultAppPath || "");

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

    const initialize = function(locale: unknown, nextAppPath: unknown): void {
        appPath = String(nextAppPath || appPath || options.defaultAppPath || "");

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

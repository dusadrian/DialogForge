export const i18n = {
    init: function(_languageNS: string, _appPath: string): void {},
    setLocale: function(_languageNS: string, _appPath: string): void {},
    t: function(message: string): string {
        return String(message || "");
    }
};

const fallbackLanguageNames: Record<string, string> = {
    de: "Deutsch",
    el: "Ελληνικά",
    en: "English",
    es: "Español",
    fr: "Français",
    it: "Italiano",
    ja: "日本語",
    ko: "한국어",
    pl: "Polski",
    pt: "Português",
    ro: "Română",
    zh: "中文"
};


const capitalize = function(value: string, locale: string): string {
    const text = String(value || "").trim();

    return text
        ? text.charAt(0).toLocaleUpperCase(locale) + text.slice(1)
        : text;
};


export const localeDisplayName = function(code: string): string {
    const normalized = String(code || "en_US").trim() || "en_US";
    const [languageValue, regionValue] = normalized.split(/[-_]/);
    const language = String(languageValue || "en").toLowerCase() === "gr"
        ? "el"
        : String(languageValue || "en").toLowerCase();
    const region = String(regionValue || "").toUpperCase();
    const locale = region ? `${language}-${region}` : language;

    try {
        const languageNames = new Intl.DisplayNames(
            [locale],
            { type: "language" }
        );
        const languageName = capitalize(
            languageNames.of(language)
                || fallbackLanguageNames[language]
                || language,
            locale
        );

        if (!region) {
            return languageName || normalized;
        }

        const regionNames = new Intl.DisplayNames(
            [locale],
            { type: "region" }
        );
        const regionName = capitalize(
            regionNames.of(region) || region,
            locale
        );

        return `${languageName || normalized} (${regionName || region})`;
    }
    catch {
        const languageName = fallbackLanguageNames[language] || language;

        return region
            ? `${languageName} (${region})`
            : languageName || normalized;
    }
};

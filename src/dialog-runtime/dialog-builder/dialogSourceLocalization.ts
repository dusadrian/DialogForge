const asRecord = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
};


export const localizeDialogSource = function(
    source: Record<string, unknown>,
    requestedLocale: string
): void {
    const i18n = asRecord(source.i18n);
    const locales = asRecord(i18n.locales);
    const availableLocales = Object.keys(locales);
    const requested = String(requestedLocale || "").trim();
    const language = requested.split(/[-_]/)[0].toLowerCase();
    const selectedLocale = availableLocales.includes(requested)
        ? requested
        : availableLocales.find((locale) => {
            return locale.split(/[-_]/)[0].toLowerCase() === language;
        }) || String(i18n.baseLocale || "").trim();
    const baseTranslations = asRecord(locales[String(i18n.baseLocale || "en_US")]);
    const translations = { ...baseTranslations, ...asRecord(locales[selectedLocale]) };
    const messages = function(values: Record<string, unknown>): Record<string, unknown> {
        return Object.fromEntries(
            Object.entries(values).filter(([key]) => key.startsWith("messages."))
        );
    };

    source.__baseMessages = messages(baseTranslations);
    source.__localizedMessages = messages(translations);

    if (Object.keys(translations).length === 0) {
        return;
    }

    const properties = asRecord(source.properties);
    const title = String(translations["dialog.title"] || "").trim();

    if (title) {
        properties.title = title;
    }
    properties.language = selectedLocale;
    source.properties = properties;

    if (!Array.isArray(source.elements)) {
        return;
    }

    source.elements.forEach((value) => {
        const element = asRecord(value);
        const id = String(element.id || "").trim();

        if (!id) {
            return;
        }

        ["label", "value"].forEach((property) => {
            const key = `elements.${id}.${property}`;

            if (Object.prototype.hasOwnProperty.call(translations, key)) {
                if (
                    property === "value"
                    && !Object.prototype.hasOwnProperty.call(
                        element,
                        "__baseValue"
                    )
                ) {
                    element.__baseValue = String(element.value ?? "");
                }

                element[property] = String(translations[key] ?? "");
            }
        });
    });
};

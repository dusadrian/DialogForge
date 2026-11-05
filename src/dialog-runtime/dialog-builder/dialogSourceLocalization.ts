import { localizeDialogDocument } from '@dialogcreator/renderer/core';
import type { PreviewDialog } from '@dialogcreator/renderer';

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
    Object.assign(source, localizeDialogDocument(source as unknown as PreviewDialog, selectedLocale));
};

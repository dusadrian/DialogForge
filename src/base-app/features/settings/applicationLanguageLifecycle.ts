export interface ApplicationLanguageChangeOptions {
    persist?: boolean;
}


export const createApplicationLanguageLifecycle = function(bindings: {
    currentLocale(): string;
    currentTranslations(): Record<string, string>;
    appPath(): string;
    persistLocale(locale: string): void;
    applyLocale(locale: string): void | Promise<void>;
    refreshSurfaces(options: ApplicationLanguageChangeOptions): void | Promise<void>;
    notifyChanged(payload: {
        languageNS: string;
        language: string;
        appPath: string;
        i18n: Record<string, string>;
    }): void;
}) {
    let pendingChange: Promise<void> | null = null;

    const applyLanguageChange = function(
        value: unknown,
        options: ApplicationLanguageChangeOptions = {}
    ): void | Promise<void> {
        const locale = String(value || "").trim();

        if (!locale || locale === bindings.currentLocale()) {
            return;
        }

        if (options.persist !== false) {
            bindings.persistLocale(locale);
        }

        const refresh = function(): void | Promise<void> {
            const payload = {
                languageNS: locale,
                language: locale.split(/[-_]/)[0].toLowerCase(),
                appPath: bindings.appPath(),
                i18n: { ...bindings.currentTranslations() }
            };
            const notify = function(): void {
                bindings.notifyChanged(payload);
            };
            const refreshed = bindings.refreshSurfaces(options);

            if (refreshed) {
                return refreshed.then(notify);
            }

            notify();
        };
        const applied = bindings.applyLocale(locale);

        if (applied) {
            return applied.then(refresh);
        }

        return refresh();
    };

    const retainPendingLanguageChange = function(change: Promise<void>): Promise<void> {
        const pending = change.then(function(): void {
            if (pendingChange === pending) {
                pendingChange = null;
            }
        }, function(error: unknown): never {
            if (pendingChange === pending) {
                pendingChange = null;
            }

            throw error;
        });

        pendingChange = pending;
        return pending;
    };

    return function(
        value: unknown,
        options: ApplicationLanguageChangeOptions = {}
    ): void | Promise<void> {
        if (pendingChange) {
            const applyNext = function(): void | Promise<void> {
                return applyLanguageChange(value, options);
            };

            // Cancel and later selections must follow any outstanding Preview,
            // including a failed one, before comparing against the live locale.
            return retainPendingLanguageChange(pendingChange.then(applyNext, applyNext));
        }

        const changed = applyLanguageChange(value, options);

        if (changed) {
            return retainPendingLanguageChange(changed);
        }
    };
};

import type {
    ApplicationSettings
} from "./applicationSettingsIpc";
import {
    mergeApplicationSettings,
    synchronizeApplicationSettingsLocale
} from "./applicationSettingsPolicy";


export interface ApplicationSettingsLifecycleBindings {
    readSettings(): ApplicationSettings;
    writeSettings(settings: ApplicationSettings): void;
    visibleRuntimeProviderIds(): string[];
    defaultRuntimeProvider(): string;
    setPreview(settings: ApplicationSettings | null): void;
    applyLive(settings: ApplicationSettings): void | Promise<void>;
}


export const readApplicationSettingsLocale = function(
    settings: ApplicationSettings
): string {
    return String(settings.defaultLanguage || settings.languageNS || "en_US");
};


// Settings messages are fire-and-forget. Keep synchronous host failures and
// rejected asynchronous application work inside the same delivery boundary.
export const runApplicationSettingsOperation = function(
    operation: () => void | Promise<void>,
    reportFailure: (message: string) => void,
    isCurrentSurface: () => boolean = () => true
): void {
    const report = function(error: unknown): void {
        reportFailure(error instanceof Error ? error.message : String(error));
    };
    let pending: void | Promise<void>;

    try {
        if (!isCurrentSurface()) {
            return;
        }

        pending = operation();
    } catch (error) {
        report(error);
        return;
    }

    if (pending) {
        void pending.catch(report);
    }
};


export const createApplicationSettingsLifecycle = function(
    bindings: ApplicationSettingsLifecycleBindings
) {
    const mergeSettings = function(
        current: ApplicationSettings,
        input: unknown
    ): ApplicationSettings {
        return mergeApplicationSettings(
            current,
            input,
            bindings.visibleRuntimeProviderIds(),
            bindings.defaultRuntimeProvider()
        );
    };

    return {
        preview: function(input: unknown): void | Promise<void> {
            const next = mergeSettings(bindings.readSettings(), input);

            bindings.setPreview(next);
            return bindings.applyLive(next);
        },
        cancel: function(): void | Promise<void> {
            const saved = bindings.readSettings();

            bindings.setPreview(null);
            return bindings.applyLive(saved);
        },
        save: function(
            input: unknown,
            notifySaved: () => void,
            isCurrentSurface: () => boolean = () => true
        ): void | Promise<void> {
            if (!isCurrentSurface()) {
                return;
            }

            const current = bindings.readSettings();
            const next = synchronizeApplicationSettingsLocale(
                current, mergeSettings(current, input), input
            );

            bindings.writeSettings(next);
            bindings.setPreview(null);
            const applied = bindings.applyLive(next);
            const notifyCurrentSurface = function(): void {
                if (isCurrentSurface()) {
                    notifySaved();
                }
            };

            if (applied) {
                return applied.then(notifyCurrentSurface);
            }

            notifyCurrentSurface();
        }
    };
};

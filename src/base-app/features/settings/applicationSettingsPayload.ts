import type {
    ApplicationSettings,
    RuntimeLocationResult
} from "./applicationSettingsIpc";
import {
    createFactoryApplicationSettings
} from "./applicationSettingsPolicy";


export interface ApplicationSettingsPayloadOptions {
    settings: ApplicationSettings;
    defaultRuntimeProvider: string;
    selectedRuntimeProvider: string;
    locales: Array<{ code: string; label: string }>;
    runtimeProviders: Array<{ id: string; label: string }>;
    runtimeLocationStates: Record<string, RuntimeLocationResult>;
    strings: Record<string, string>;
}


export const createApplicationSettingsPayload = function(
    options: ApplicationSettingsPayloadOptions
) {
    return {
        settings: options.settings,
        factorySettings: createFactoryApplicationSettings(
            options.defaultRuntimeProvider
        ),
        locales: options.locales,
        runtimeProviders: options.runtimeProviders,
        runtimeLocationStates: options.runtimeLocationStates,
        selectedRuntimeProvider: options.selectedRuntimeProvider,
        strings: options.strings
    };
};

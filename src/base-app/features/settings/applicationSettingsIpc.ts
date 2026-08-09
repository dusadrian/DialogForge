import {
    invokeTypedIpcRoute,
    sendTypedIpcCommand,
    type IpcInvokeTransport,
    type IpcSendTransport
} from "../../../core/ipc/typedIpc";
import {
    dialogRuntimeEventChannels
} from "../../../dialog-runtime/dialogRuntimeIpc";


export type ApplicationSettings = Record<string, unknown>;

export interface RuntimeLocationResult {
    providerId: string;
    configurable: boolean;
    configuredPath: string;
    resolvedPath: string;
    source: "configured" | "discovered" | "invalid" | "unavailable";
    message: string;
}


export interface ApplicationSettingsRendererBridge {
    onLoaded(callback: (payload: unknown) => void): void;
    onSaved(callback: () => void): void;
    chooseRuntimeLocation(input: {
        providerId?: string;
        currentPath?: string;
    }): Promise<{ path: string } | null>;
    discoverRuntimeLocation(input: {
        providerId?: string;
    }): Promise<RuntimeLocationResult>;
    preview(input: unknown): void;
    cancelPreview(): void;
    save(input: unknown): void;
    close?(): void;
}


export const applicationSettingsIpcChannels = {
    read: "base-app:readSettings",
    readWindowPayload: "base-app:readSettingsWindowPayload",
    write: "base-app:writeSettings",
    openSettings: "base-app:openSettingsWindow",
    openMenuCustomization: "base-app:openMenuCustomizationWindow",
    openDialogRuntimeRequirements: "base-app:openDialogRuntimeRequirementsWindow",
    chooseRuntimeLocation: "base-app:chooseRuntimeLocation",
    discoverRuntimeLocation: "base-app:discoverRuntimeLocation",
    openAbout: "base-app:openAboutWindow"
} as const;


export const applicationSettingsEventChannels = {
    previewSettings: "base-app:settings-preview",
    cancelSettingsPreview: "base-app:settings-preview-cancel",
    saveSettings: "base-app:settings-save",
    closeSettingsWindow: "base-app:settings-close-window",
    settingsLoaded: "base-app:settings-loaded",
    settingsSaved: "base-app:settings-saved",
    settingsUpdated: "base-app:settings-updated",
    saveDialogRuntimeRequirements: "base-app:save-dialog-runtime-requirements",
    dialogRuntimeRequirementsLoaded: dialogRuntimeEventChannels.requirementsLoaded,
    dialogRuntimeRequirementsSaved: dialogRuntimeEventChannels.requirementsSaved,
    saveMenuCustomization: "base-app:save-menu-customization",
    browseMenuDialog: "base-app:browse-menu-dialog",
    menuCustomizationLoaded: "base-app:menu-customization-loaded",
    menuCustomizationSaved: "base-app:menu-customization-saved",
    menuDialogBrowsed: "base-app:menu-dialog-browsed"
} as const;


interface ApplicationSettingsCommands {
    "base-app:settings-preview": [ApplicationSettings];
    "base-app:settings-preview-cancel": [];
    "base-app:settings-save": [ApplicationSettings];
    "base-app:save-dialog-runtime-requirements": [{
        dialogId?: string;
        rPackages?: unknown;
    }];
    "base-app:save-menu-customization": [{
        menu?: unknown;
        runtimeProvider?: unknown;
    }];
    "base-app:browse-menu-dialog": [];
}


interface ApplicationSettingsIpcRoutes {
    "base-app:readSettings": { input: []; result: ApplicationSettings };
    "base-app:readSettingsWindowPayload": {
        input: [];
        result: Record<string, unknown>;
    };
    "base-app:writeSettings": {
        input: [ApplicationSettings];
        result: ApplicationSettings;
    };
    "base-app:openSettingsWindow": { input: []; result: { status: string } };
    "base-app:openMenuCustomizationWindow": { input: []; result: { status: string } };
    "base-app:openDialogRuntimeRequirementsWindow": { input: []; result: { status: string } };
    "base-app:chooseRuntimeLocation": {
        input: [{ providerId?: string; currentPath?: string }];
        result: { path: string } | null;
    };
    "base-app:discoverRuntimeLocation": {
        input: [{ providerId?: string }];
        result: RuntimeLocationResult;
    };
    "base-app:openAboutWindow": { input: []; result: { status: string } };
}


export const invokeApplicationSettingsRoute = function<
    Channel extends keyof ApplicationSettingsIpcRoutes & string
>(
    transport: IpcInvokeTransport,
    channel: Channel,
    ...args: ApplicationSettingsIpcRoutes[Channel]["input"]
): Promise<ApplicationSettingsIpcRoutes[Channel]["result"]> {
    return invokeTypedIpcRoute<
        ApplicationSettingsIpcRoutes[Channel]["input"],
        ApplicationSettingsIpcRoutes[Channel]["result"]
    >(transport, channel, ...args);
};


export const sendApplicationSettingsCommand = function<
    Channel extends keyof ApplicationSettingsCommands & string
>(
    transport: IpcSendTransport,
    channel: Channel,
    ...args: ApplicationSettingsCommands[Channel]
): void {
    sendTypedIpcCommand<ApplicationSettingsCommands[Channel]>(
        transport,
        channel,
        ...args
    );
};

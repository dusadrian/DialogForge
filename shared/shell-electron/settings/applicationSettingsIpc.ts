import {
    invokeTypedIpcRoute,
    sendTypedIpcCommand,
    type IpcInvokeTransport,
    type IpcSendTransport
} from "../../core/ipc/typedIpc";
import {
    dialogRuntimeEventChannels
} from "../../dialog-runtime/dialogRuntimeIpc";


export type ApplicationSettings = Record<string, unknown>;


export const applicationSettingsIpcChannels = {
    read: "base-app:readSettings",
    write: "base-app:writeSettings",
    openSettings: "base-app:openSettingsWindow",
    openMenuCustomization: "base-app:openMenuCustomizationWindow",
    openDialogRuntimeRequirements: "base-app:openDialogRuntimeRequirementsWindow",
    openAbout: "base-app:openAboutWindow"
} as const;


export const applicationSettingsEventChannels = {
    saveSettings: "base-app:settings-save",
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
    "base-app:writeSettings": {
        input: [ApplicationSettings];
        result: ApplicationSettings;
    };
    "base-app:openSettingsWindow": { input: []; result: { status: string } };
    "base-app:openMenuCustomizationWindow": { input: []; result: { status: string } };
    "base-app:openDialogRuntimeRequirementsWindow": { input: []; result: { status: string } };
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

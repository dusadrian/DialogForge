import * as fs from "fs";
import type {
    Dialog,
    IpcMain,
    IpcMainEvent,
    IpcMainInvokeEvent
} from "electron";

import type {
    ResolvedProductLocation
} from "../../core/contracts/productLocation";
import {
    updateDialogRuntimeRequirements
} from "../../dialog-runtime/requirements/dialogRuntimeRequirements";
import {
    importDialogPackage,
    planDialogPackageImport
} from "./dialogPackageImport";
import type {
    DialogRuntimeRequirementsWindowController
} from "../../dialog-runtime/requirements/dialogRuntimeRequirementsWindowController";
import type {
    AboutWindowPayload
} from "../external/aboutWindowController";
import type {
    MenuCustomizationWindowController
} from "../menus/menuCustomizationWindowController";
import type {
    SettingsWindowController
} from "./settingsWindowController";
import {
    applicationSettingsEventChannels,
    applicationSettingsIpcChannels,
    type ApplicationSettings
} from "./applicationSettingsIpc";


type MenuCustomizationNode = {
    id: string;
    name: string;
    type: string;
    runtimeProvider?: string;
    dependencies?: string;
    subitems?: MenuCustomizationNode[];
};


export interface ApplicationSettingsIpcControllerOptions {
    ipcMain: IpcMain;
    dialog: Dialog;
    settingsWindowController: SettingsWindowController;
    menuCustomizationWindowController: MenuCustomizationWindowController;
    dialogRuntimeRequirementsWindowController:
        DialogRuntimeRequirementsWindowController;
    readSettings(): ApplicationSettings;
    writeSettings(settings: ApplicationSettings): void;
    openSettingsWindow(): void;
    openMenuCustomizationWindow(): void;
    openDialogRuntimeRequirementsWindow(): void;
    openAboutWindow(payload: AboutWindowPayload): void;
    buildAboutWindowPayload(): AboutWindowPayload;
    installApplicationMenu(): void;
    applyLanguage(locale: string): void;
    sendToAllWindows(channel: string, payload: unknown): void;
    userDialogsDirectory(): string;
    rootDir: string;
    productLocation: ResolvedProductLocation;
    defaultRuntimeProvider: string;
    visibleRuntimeProviderIds: string[];
    translate(text: string): string;
}


const isRecord = function(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
};


const mergeTerminalSettings = function(
    current: ApplicationSettings,
    patch: ApplicationSettings
): ApplicationSettings {
    return Object.assign({}, current, patch, {
        terminalSettings: Object.assign(
            {},
            isRecord(current.terminalSettings) ? current.terminalSettings : {},
            isRecord(patch.terminalSettings) ? patch.terminalSettings : {}
        )
    });
};


const mergeRuntimeStartup = function(
    current: ApplicationSettings,
    patch: ApplicationSettings,
    visibleRuntimeProviderIds: string[],
    defaultRuntimeProvider: string
): ApplicationSettings {
    if (!isRecord(patch.runtimeStartup)) {
        return patch;
    }

    const currentStartup = isRecord(current.runtimeStartup)
        ? current.runtimeStartup
        : {};
    const visibleProviders = visibleRuntimeProviderIds.map((providerId) => {
        return String(providerId || "").trim();
    }).filter(Boolean);
    const defaultProvider = String(defaultRuntimeProvider || "").trim();
    const requestedProvider = String(patch.runtimeStartup.providerId || "").trim();
    const currentProvider = String(currentStartup.providerId || "").trim();
    const providerId = visibleProviders.includes(requestedProvider)
        ? requestedProvider
        : visibleProviders.includes(currentProvider)
            ? currentProvider
            : visibleProviders[0] || defaultProvider;

    return Object.assign({}, patch, {
        runtimeStartup: Object.assign(
            {},
            currentStartup,
            patch.runtimeStartup,
            { providerId }
        )
    });
};


const collectMenuRequirements = function(
    items: MenuCustomizationNode[],
    requirements: Record<string, { rPackages: string[] }>,
    defaultRuntimeProvider: string
): void {
    items.forEach((item) => {
        if (item.type === "dialog") {
            const runtimeProvider = String(item.runtimeProvider || defaultRuntimeProvider || "").trim();
            const rPackages = Array.from(new Set(
                runtimeProvider === "r"
                    ? String(item.dependencies || "")
                        .split(/[;,\n]/g)
                        .map((name) => name.trim())
                        .filter(Boolean)
                    : []
            ));

            if (rPackages.length > 0) {
                requirements[item.id] = {
                    rPackages
                };
            }
        }

        if (item.type === "submenu" && Array.isArray(item.subitems)) {
            collectMenuRequirements(item.subitems, requirements, defaultRuntimeProvider);
        }
    });
};


const openWindowResult = function(): { status: string } {
    return {
        status: "opened"
    };
};


export const createApplicationSettingsIpcController = function(
    options: ApplicationSettingsIpcControllerOptions
): void {
    options.ipcMain.handle(applicationSettingsIpcChannels.read, async () => {
        return options.readSettings();
    });

    options.ipcMain.handle(applicationSettingsIpcChannels.write, async (
        _event: IpcMainInvokeEvent,
        input: ApplicationSettings
    ) => {
        options.writeSettings(input || {});

        return options.readSettings();
    });

    options.ipcMain.handle(applicationSettingsIpcChannels.openSettings, async () => {
        options.openSettingsWindow();

        return openWindowResult();
    });

    options.ipcMain.handle(applicationSettingsIpcChannels.openMenuCustomization, async () => {
        options.openMenuCustomizationWindow();

        return openWindowResult();
    });

    options.ipcMain.handle(
        applicationSettingsIpcChannels.openDialogRuntimeRequirements,
        async () => {
            options.openDialogRuntimeRequirementsWindow();

            return openWindowResult();
        }
    );

    options.ipcMain.handle(applicationSettingsIpcChannels.openAbout, async () => {
        options.openAboutWindow(options.buildAboutWindowPayload());

        return openWindowResult();
    });

    options.ipcMain.on(applicationSettingsEventChannels.saveSettings, (
        _event: IpcMainEvent,
        input: ApplicationSettings
    ) => {
        const current = options.readSettings();
        const patch = isRecord(input) ? input : {};
        const next = mergeTerminalSettings(
            current,
            mergeRuntimeStartup(
                current,
                patch,
                options.visibleRuntimeProviderIds,
                options.defaultRuntimeProvider
            )
        );
        const currentLocale = String(
            current.defaultLanguage || current.languageNS || "en_US"
        );
        const nextLocale = String(
            next.defaultLanguage || next.languageNS || currentLocale
        );

        if (Object.prototype.hasOwnProperty.call(patch, "defaultLanguage")) {
            next.languageNS = nextLocale;
        }

        options.writeSettings(next);
        if (nextLocale !== currentLocale) {
            options.applyLanguage(nextLocale);
        }
        options.sendToAllWindows(applicationSettingsEventChannels.settingsUpdated, next);
        options.installApplicationMenu();
        options.settingsWindowController.notifySaved();
    });

    options.ipcMain.on(applicationSettingsEventChannels.saveDialogRuntimeRequirements, (
        _event: IpcMainEvent,
        input: { dialogId?: string; rPackages?: unknown }
    ) => {
        const dialogId = String(input?.dialogId || "").trim();

        if (!dialogId) {
            return;
        }

        const current = options.readSettings();
        const requirements = updateDialogRuntimeRequirements(
            current.dialogRuntimeRequirements,
            dialogId,
            input?.rPackages
        );
        const rPackages = requirements[dialogId].rPackages || [];

        options.writeSettings(Object.assign({}, current, {
            dialogRuntimeRequirements: requirements
        }));

        options.dialogRuntimeRequirementsWindowController.notifySaved({
            dialogId,
            rPackages
        });
    });

    options.ipcMain.on(applicationSettingsEventChannels.saveMenuCustomization, (
        _event: IpcMainEvent,
        input: { menu?: unknown; runtimeProvider?: unknown }
    ) => {
        if (!Array.isArray(input?.menu)) {
            return;
        }

        const menu = input.menu as MenuCustomizationNode[];
        const requirements: Record<string, { rPackages: string[] }> = {};
        collectMenuRequirements(menu, requirements, String(input?.runtimeProvider || "").trim());

        const current = options.readSettings();

        options.writeSettings(Object.assign({}, current, {
            menuCustomization: menu,
            dialogRuntimeRequirements: Object.assign(
                {},
                isRecord(current.dialogRuntimeRequirements)
                    ? current.dialogRuntimeRequirements
                    : {},
                requirements
            )
        }));
        options.installApplicationMenu();
        options.menuCustomizationWindowController.notifySaved({ ok: true });
    });

    options.ipcMain.on(applicationSettingsEventChannels.browseMenuDialog, async () => {
        const menuCustomizationWindow =
            options.menuCustomizationWindowController.getWindow();

        if (!menuCustomizationWindow) {
            return;
        }

        const picked = await options.dialog.showOpenDialog(
            menuCustomizationWindow,
            {
                title: options.translate("Choose DialogCreator package"),
                properties: ["openFile"],
                filters: [
                    {
                        name: "DialogCreator package",
                        extensions: ["dc.zip"]
                    }
                ]
            }
        );

        if (picked.canceled || picked.filePaths.length === 0) {
            return;
        }

        const sourcePath = picked.filePaths[0];

        try {
            const target = {
                rootDir: options.rootDir,
                location: options.productLocation,
                defaultRuntimeProvider: options.defaultRuntimeProvider
            };
            const plan = planDialogPackageImport(sourcePath, target);

            if (fs.existsSync(plan.targetDirectory)) {
                const overwrite = await options.dialog.showMessageBox(
                    menuCustomizationWindow,
                    {
                        type: "question",
                        title: options.translate("Already exists"),
                        message: options.translate(
                            "A dialog package with this name already exists. Overwrite?"
                        ),
                        buttons: [
                            options.translate("No"),
                            options.translate("Yes")
                        ],
                        defaultId: 1,
                        cancelId: 0
                    }
                );

                if (overwrite.response !== 1) {
                    return;
                }
            }

            const imported = importDialogPackage(sourcePath, target);
            options.menuCustomizationWindowController.notifyDialogBrowsed({
                id: imported.id,
                name: imported.label
            });
        } catch (error) {
            await options.dialog.showMessageBox(menuCustomizationWindow, {
                type: "error",
                title: options.translate("Error"),
                message: options.translate(
                    "Selected file is not a valid DialogCreator package."
                ),
                detail: error instanceof Error ? error.message : String(error),
                buttons: [
                    options.translate("OK")
                ]
            });
        }
    });
};

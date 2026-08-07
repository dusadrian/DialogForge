import * as fs from "fs";
import * as path from "path";
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
import {
    normalizeRuntimeProvider
} from "../../base-app/features/menu-commands/menuRuntimeProvider";
import {
    canWriteProductMenu,
    writeProductMenu
} from "../menus/productMenuWriter";
import type {
    DialogRuntimeRequirementsWindowController
} from "../dialog-runtime/dialogRuntimeRequirementsWindowController";
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
    type ApplicationSettings,
    type RuntimeLocationResult
} from "../../base-app/features/settings/applicationSettingsIpc";
import {
    applicationEventChannels
} from "../../base-app/bootstrap/applicationEvents";
import {
    normalizeConsoleEditorSettings
} from "../../console/consoleTypography";
import {
    mergeApplicationSettings,
    synchronizeApplicationSettingsLocale
} from "../../base-app/features/settings/applicationSettingsPolicy";


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
    setSettingsPreview(settings: ApplicationSettings | null): void;
    sendToAllWindows(channel: string, payload: unknown): void;
    userDialogsDirectory(): string;
    rootDir: string;
    productLocation: ResolvedProductLocation;
    // Running from a checkout rather than a packaged bundle. Menu arrangements
    // are written back into the product repository only in that case.
    isPackagedApp: boolean;
    defaultRuntimeProvider: string;
    visibleRuntimeProviderIds: string[];
    discoverRuntimeLocation(providerId: string): Promise<RuntimeLocationResult>;
    translate(text: string): string;
}


const isRecord = function(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
};


const collectMenuRequirements = function(
    items: MenuCustomizationNode[],
    requirements: Record<string, { rPackages: string[] }>,
    defaultRuntimeProvider: string
): void {
    items.forEach((item) => {
        if (item.type === "dialog") {
            // Case-insensitive: a menu item imported from DialogCreator can
            // carry "R" where the product declares "r", and dropping its
            // dependencies over that would be silent.
            const runtimeProvider = normalizeRuntimeProvider(
                item.runtimeProvider || defaultRuntimeProvider
            );
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

const applySettingsLive = function(
    options: ApplicationSettingsIpcControllerOptions,
    settings: ApplicationSettings
): void {
    const locale = String(
        settings.defaultLanguage || settings.languageNS || "en_US"
    );

    options.applyLanguage(locale);
    options.sendToAllWindows(
        applicationSettingsEventChannels.settingsUpdated,
        settings
    );
    const normalizedConsoleSettings = normalizeConsoleEditorSettings(
        isRecord(settings.terminalSettings) ? settings.terminalSettings : {}
    );

    options.sendToAllWindows(
        applicationEventChannels.terminalSettingsUpdated,
        {
            fontFamily: normalizedConsoleSettings.fontFamily,
            fontSize: normalizedConsoleSettings.fontSize,
            cursorStyle: normalizedConsoleSettings.cursorStyle,
            cursorBlink:
                normalizedConsoleSettings.cursorBlinking !== "solid",
            selectionBackground:
                normalizedConsoleSettings.selectionBackground
        }
    );
    options.installApplicationMenu();
};


export const createApplicationSettingsIpcController = function(
    options: ApplicationSettingsIpcControllerOptions
): { cancelSettingsPreview(): void } {
    const cancelSettingsPreview = function(): void {
        const saved = options.readSettings();

        options.setSettingsPreview(null);
        applySettingsLive(options, saved);
    };

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

    options.ipcMain.handle(
        applicationSettingsIpcChannels.chooseRuntimeLocation,
        async (_event: IpcMainInvokeEvent, input: {
            providerId?: string;
            currentPath?: string;
        }) => {
            const currentPath = String(input?.currentPath || "").trim();
            const defaultPath = currentPath
                ? fs.existsSync(currentPath) && fs.statSync(currentPath).isDirectory()
                    ? currentPath
                    : path.dirname(currentPath)
                : undefined;
            const dialogOptions = {
                title: options.translate("Choose runtime executable"),
                defaultPath,
                properties: ["openFile"] as Array<"openFile">
            };
            const parentWindow = options.settingsWindowController.getWindow();
            const result = parentWindow
                ? await options.dialog.showOpenDialog(
                    parentWindow,
                    dialogOptions
                )
                : await options.dialog.showOpenDialog(dialogOptions);

            if (result.canceled || !result.filePaths[0]) {
                return null;
            }

            return {
                path: result.filePaths[0]
            };
        }
    );

    options.ipcMain.handle(
        applicationSettingsIpcChannels.discoverRuntimeLocation,
        async (_event: IpcMainInvokeEvent, input: {
            providerId?: string;
        }) => {
            const providerId = String(input?.providerId || "").trim();

            if (!options.visibleRuntimeProviderIds.includes(providerId)) {
                return {
                    providerId,
                    configurable: false,
                    configuredPath: "",
                    resolvedPath: "",
                    source: "unavailable",
                    message: "Runtime provider is not available."
                };
            }

            return options.discoverRuntimeLocation(providerId);
        }
    );

    options.ipcMain.handle(applicationSettingsIpcChannels.openAbout, async () => {
        options.openAboutWindow(options.buildAboutWindowPayload());

        return openWindowResult();
    });

    options.ipcMain.on(applicationSettingsEventChannels.previewSettings, (
        _event: IpcMainEvent,
        input: ApplicationSettings
    ) => {
        const current = options.readSettings();
        const next = mergeApplicationSettings(
            current,
            input,
            options.visibleRuntimeProviderIds,
            options.defaultRuntimeProvider
        );

        options.setSettingsPreview(next);
        applySettingsLive(options, next);
    });

    options.ipcMain.on(applicationSettingsEventChannels.cancelSettingsPreview, () => {
        cancelSettingsPreview();
    });

    options.ipcMain.on(applicationSettingsEventChannels.saveSettings, (
        _event: IpcMainEvent,
        input: ApplicationSettings
    ) => {
        const current = options.readSettings();
        const next = synchronizeApplicationSettingsLocale(
            current,
            mergeApplicationSettings(
                current,
                input,
                options.visibleRuntimeProviderIds,
                options.defaultRuntimeProvider
            ),
            input
        );
        const currentLocale = String(
            current.defaultLanguage || current.languageNS || "en_US"
        );
        const nextLocale = String(
            next.defaultLanguage || next.languageNS || currentLocale
        );

        options.setSettingsPreview(null);
        options.writeSettings(next);
        if (nextLocale !== currentLocale) {
            options.applyLanguage(nextLocale);
        }
        applySettingsLive(options, next);
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

        // Against a checkout the arrangement also belongs in the product
        // repository, so it can be committed rather than living only in this
        // machine's settings. Base menu roots are left to DialogForge.
        if (canWriteProductMenu({
            location: options.productLocation,
            isPackaged: options.isPackagedApp
        })) {
            try {
                writeProductMenu({
                    location: options.productLocation,
                    nodes: menu
                });
            } catch (error) {
                // A failed write must not lose the arrangement: it is already
                // saved in settings, so the menu still reflects the change.
                console.error("[menu customization] product menu write failed", error);
            }
        }

        options.installApplicationMenu();
        options.menuCustomizationWindowController.notifySaved({ ok: true });
    });

    options.ipcMain.on(applicationSettingsEventChannels.browseMenuDialog, async () => {
        const menuCustomizationWindow =
            options.menuCustomizationWindowController.getWindow();

        if (!menuCustomizationWindow) {
            return;
        }

        // A dialog source is either a .dc.zip package or the folder that
        // unzipping it produces. macOS can offer both in one panel; Windows and
        // Linux cannot, so there the kind is chosen first.
        const packageFilters = [
            {
                name: "DialogCreator package",
                extensions: ["dc.zip"]
            }
        ];
        const pickSource = async function() {
            if (process.platform === "darwin") {
                return options.dialog.showOpenDialog(menuCustomizationWindow, {
                    title: options.translate(
                        "Choose DialogCreator package or folder"
                    ),
                    properties: ["openFile", "openDirectory"],
                    filters: packageFilters
                });
            }

            const kind = await options.dialog.showMessageBox(
                menuCustomizationWindow,
                {
                    type: "question",
                    title: options.translate("Import dialog"),
                    message: options.translate(
                        "Import a DialogCreator package file or a dialog folder?"
                    ),
                    buttons: [
                        options.translate("Cancel"),
                        options.translate("Package file"),
                        options.translate("Folder")
                    ],
                    defaultId: 1,
                    cancelId: 0
                }
            );

            if (kind.response === 0) {
                return {
                    canceled: true,
                    filePaths: [] as string[]
                };
            }

            return options.dialog.showOpenDialog(menuCustomizationWindow, {
                title: kind.response === 2
                    ? options.translate("Choose dialog folder")
                    : options.translate("Choose DialogCreator package"),
                properties: kind.response === 2
                    ? ["openDirectory"]
                    : ["openFile"],
                ...(kind.response === 2 ? {} : { filters: packageFilters })
            });
        };
        const picked = await pickSource();

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
                    "Selected item is not a valid DialogCreator package or dialog folder."
                ),
                detail: error instanceof Error ? error.message : String(error),
                buttons: [
                    options.translate("OK")
                ]
            });
        }
    });

    return {
        cancelSettingsPreview
    };
};

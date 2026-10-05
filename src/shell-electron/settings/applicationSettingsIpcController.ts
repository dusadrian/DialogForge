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
import type {
    ProductDialogRuntimeRequirement
} from "../../core/contracts/applicationComposition";
import {
    normalizeDialogRuntimePackages,
    updateDialogRuntimeRequirements
} from "../../dialog-runtime/requirements/dialogRuntimeRequirements";
import {
    importDialogPackage,
    planDialogPackageImport
} from "./dialogPackageImport";
import {
    normalizeRuntimeProvider
} from "../../base-app/features/menu-commands/menuRuntimeProvider";
import type {
    MenuCustomizationSaveRequest
} from "../../base-app/features/menu-commands/menuCustomizationProtocol";
import {
    menuCustomizationSettingsKey
} from "../menus/menuCustomizationSettings";
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
    createApplicationSettingsLifecycle,
    readApplicationSettingsLocale,
    runApplicationSettingsOperation
} from "../../base-app/features/settings/applicationSettingsLifecycle";


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
    reportSettingsFailure(message: string): void;
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
    requirements: Record<string, ProductDialogRuntimeRequirement>,
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
            const rPackages = runtimeProvider === "r"
                ? normalizeDialogRuntimePackages(item.dependencies)
                : [];

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
    const locale = readApplicationSettingsLocale(settings);

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
    const settingsLifecycle = createApplicationSettingsLifecycle({
        readSettings: options.readSettings,
        writeSettings: options.writeSettings,
        visibleRuntimeProviderIds: () => options.visibleRuntimeProviderIds,
        defaultRuntimeProvider: () => options.defaultRuntimeProvider,
        setPreview: options.setSettingsPreview,
        applyLive: (settings) => applySettingsLive(options, settings)
    });
    const isCurrentSettingsSender = function(event: IpcMainEvent): boolean {
        const target = options.settingsWindowController.getWindow();

        return !!target
            && !target.isDestroyed()
            && target.webContents === event.sender;
    };
    const cancelSettingsPreview = function(event?: IpcMainEvent): void {
        runApplicationSettingsOperation(
            () => settingsLifecycle.cancel(),
            options.reportSettingsFailure,
            () => !event || isCurrentSettingsSender(event)
        );
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
        event: IpcMainEvent,
        input: ApplicationSettings
    ) => {
        runApplicationSettingsOperation(
            () => settingsLifecycle.preview(input),
            options.reportSettingsFailure,
            () => isCurrentSettingsSender(event)
        );
    });

    options.ipcMain.on(applicationSettingsEventChannels.cancelSettingsPreview, (event) => {
        cancelSettingsPreview(event);
    });

    options.ipcMain.on(applicationSettingsEventChannels.saveSettings, (
        event: IpcMainEvent,
        input: ApplicationSettings
    ) => {
        const target = options.settingsWindowController.getWindow();
        const isCurrentSurface = function(): boolean {
            return !!target
                && !target.isDestroyed()
                && target.webContents === event.sender
                && options.settingsWindowController.getWindow() === target;
        };

        runApplicationSettingsOperation(
            () => settingsLifecycle.save(input, () => {
                options.settingsWindowController.notifySaved();
            }, isCurrentSurface),
            options.reportSettingsFailure
        );
    });

    options.ipcMain.on(applicationSettingsEventChannels.saveDialogRuntimeRequirements, (
        event: IpcMainEvent,
        input: { dialogId?: string; rPackages?: unknown; requestId?: number }
    ) => {
        const target = options.dialogRuntimeRequirementsWindowController.getWindow();
        const isCurrentSurface = function(): boolean {
            return !!target
                && !target.isDestroyed()
                && target.webContents === event.sender
                && options.dialogRuntimeRequirementsWindowController.getWindow() === target;
        };

        runApplicationSettingsOperation(() => {
            const dialogId = String(input?.dialogId || "").trim();
            const requestId = input?.requestId;

            if (
                !dialogId
                || typeof requestId !== "number"
                || !Number.isSafeInteger(requestId)
                || requestId <= 0
            ) {
                return;
            }

            const current = options.readSettings();
            const requirements = updateDialogRuntimeRequirements(
                current.dialogRuntimeRequirements,
                dialogId,
                input?.rPackages
            );

            if (!isCurrentSurface()) {
                return;
            }

            options.writeSettings(Object.assign({}, current, {
                dialogRuntimeRequirements: requirements
            }));

            if (isCurrentSurface()) {
                options.dialogRuntimeRequirementsWindowController.notifySaved({
                    requestId,
                    dialogId,
                    rPackages: requirements[dialogId].rPackages || []
                });
            }
        }, options.reportSettingsFailure, isCurrentSurface);
    });

    options.ipcMain.on(applicationSettingsEventChannels.saveMenuCustomization, (
        event: IpcMainEvent,
        input: Partial<MenuCustomizationSaveRequest>
    ) => {
        const target = options.menuCustomizationWindowController.getWindow();
        const isCurrentSurface = function(): boolean {
            return !!target
                && !target.isDestroyed()
                && target.webContents === event.sender
                && options.menuCustomizationWindowController.getWindow() === target;
        };

        runApplicationSettingsOperation(() => {
            const requestId = input?.requestId;

            if (
                !Array.isArray(input?.menu)
                || typeof requestId !== "number"
                || !Number.isSafeInteger(requestId)
                || requestId <= 0
            ) {
                return;
            }

            const menu = input.menu as MenuCustomizationNode[];
            const requirements: Record<
                string,
                ProductDialogRuntimeRequirement
            > = {};
            collectMenuRequirements(
                menu, requirements, String(input?.runtimeProvider || "").trim()
            );
            const current = options.readSettings();

            if (!isCurrentSurface()) {
                return;
            }

            options.writeSettings(Object.assign({}, current, {
                // Scoped per product: in development every product shares one
                // settings file, so an unscoped arrangement leaked into the next
                // product that started.
                [menuCustomizationSettingsKey(options.productLocation.id)]: menu,
                dialogRuntimeRequirements: Object.assign(
                    {},
                    isRecord(current.dialogRuntimeRequirements)
                        ? current.dialogRuntimeRequirements
                        : {},
                    requirements
                )
            }));

            // Against a checkout the arrangement also belongs in the product
            // repository. Base menu roots are left to DialogForge. Do not let
            // a retired authoring surface initiate that additional write.
            if (isCurrentSurface() && canWriteProductMenu({
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

            if (isCurrentSurface()) {
                options.menuCustomizationWindowController.notifySaved({ requestId, ok: true });
            }
        }, options.reportSettingsFailure, isCurrentSurface);
    });

    options.ipcMain.on(applicationSettingsEventChannels.browseMenuDialog, (event) => {
        const menuCustomizationWindow =
            options.menuCustomizationWindowController.getWindow();
        const isCurrentSurface = function(): boolean {
            return !!menuCustomizationWindow
                && !menuCustomizationWindow.isDestroyed()
                && menuCustomizationWindow.webContents === event.sender
                && options.menuCustomizationWindowController.getWindow() === menuCustomizationWindow;
        };

        runApplicationSettingsOperation(async () => {
            if (!menuCustomizationWindow) {
                return;
            }

            // macOS offers packages and folders in one panel. Other platforms
            // choose the kind first. Every result still belongs to this window.
            const packageFilters = [{
                name: "DialogCreator package",
                extensions: ["dc.zip"]
            }];
            const pickSource = async function() {
                if (process.platform === "darwin") {
                    return options.dialog.showOpenDialog(menuCustomizationWindow, {
                        title: options.translate("Choose DialogCreator package or folder"),
                        properties: ["openFile", "openDirectory"],
                        filters: packageFilters
                    });
                }

                const kind = await options.dialog.showMessageBox(menuCustomizationWindow, {
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
                });

                if (!isCurrentSurface() || kind.response === 0) {
                    return { canceled: true, filePaths: [] as string[] };
                }

                return options.dialog.showOpenDialog(menuCustomizationWindow, {
                    title: kind.response === 2
                        ? options.translate("Choose dialog folder")
                        : options.translate("Choose DialogCreator package"),
                    properties: kind.response === 2 ? ["openDirectory"] : ["openFile"],
                    ...(kind.response === 2 ? {} : { filters: packageFilters })
                });
            };
            const picked = await pickSource();

            if (!isCurrentSurface() || picked.canceled || picked.filePaths.length === 0) {
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

                if (!isCurrentSurface()) {
                    return;
                }

                if (fs.existsSync(plan.targetDirectory)) {
                    const overwrite = await options.dialog.showMessageBox(menuCustomizationWindow, {
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
                    });

                    if (!isCurrentSurface() || overwrite.response !== 1) {
                        return;
                    }
                }

                const imported = importDialogPackage(sourcePath, target);

                if (isCurrentSurface()) {
                    options.menuCustomizationWindowController.notifyDialogBrowsed({
                        id: imported.id,
                        name: imported.label,
                        rPackageRequirements: imported.definition.rPackages || []
                    });
                }
            } catch (error) {
                if (!isCurrentSurface()) {
                    return;
                }

                await options.dialog.showMessageBox(menuCustomizationWindow, {
                    type: "error",
                    title: options.translate("Error"),
                    message: options.translate(
                        "Selected item is not a valid DialogCreator package or dialog folder."
                    ),
                    detail: error instanceof Error ? error.message : String(error),
                    buttons: [options.translate("OK")]
                });
            }
        }, options.reportSettingsFailure, isCurrentSurface);
    });

    return {
        cancelSettingsPreview
    };
};

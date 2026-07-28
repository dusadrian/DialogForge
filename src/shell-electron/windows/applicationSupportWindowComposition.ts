import * as fs from "fs";
import * as path from "path";
import type {
    App,
    BrowserWindow,
    Dialog,
    IpcMain
} from "electron";

import type {
    ApplicationComposition,
    DialogDefinition
} from "../../core/contracts/applicationComposition";
import {
    applicationEventChannels
} from "../../base-app/bootstrap/applicationEvents";
import {
    parseNewDialogJson
} from "../../dialog-runtime/renderer/modules/dialogAdapter";
import type {
    SendMenuCommand
} from "../menus/applicationMenu";
import {
    createApplicationMenuInstaller
} from "../menus/applicationMenuInstaller";
import {
    createLanguageMenuController
} from "../menus/languageMenuController";
import {
    createMenuCustomizationWindowController
} from "../menus/menuCustomizationWindowController";
import {
    createMenuCustomizationWindowFactory
} from "../menus/menuCustomizationWindowFactory";
import {
    createMenuCustomizationModel
} from "../menus/menuCustomizationModel";
import {
    createSettingsWindowController
} from "../settings/settingsWindowController";
import {
    createSettingsWindowFactory
} from "../settings/settingsWindowFactory";
import {
    createApplicationSettingsIpcController
} from "../settings/applicationSettingsIpcController";
import {
    createFactoryApplicationSettings
} from "../../base-app/features/settings/applicationSettingsPolicy";
import {
    createDialogRuntimeRequirementsPayload
} from "../../dialog-runtime/requirements/dialogRuntimeRequirements";
import {
    createDialogRuntimeRequirementsWindowController
} from "../dialog-runtime/dialogRuntimeRequirementsWindowController";
import {
    createDialogRuntimeRequirementsWindowFactory
} from "../dialog-runtime/dialogRuntimeRequirementsWindowFactory";
import {
    createAboutWindowController,
    type AboutWindowPayload
} from "../external/aboutWindowController";
import {
    createAboutWindowFactory
} from "../external/aboutWindowFactory";
import {
    getRuntimeProvider
} from "../../runtime/providers/runtimeProviderRegistry";


export interface ApplicationSupportWindowCompositionOptions {
    app: App;
    ipcMain: IpcMain;
    dialog: Dialog;
    composition: ApplicationComposition;
    productId: string;
    settingsPath: string;
    localePath: string;
    nativeWindowIconPath?: string;
    userDialogsDirectory(): string;
    getMainWindow(): BrowserWindow | null;
    readSettings(): Record<string, unknown>;
    writeSettings(settings: Record<string, unknown>): void;
    sendMenuCommand: SendMenuCommand;
    sendToAllWindows(channel: string, payload: unknown): void;
    applyLocale(locale: string): void;
    translate(
        key: string,
        values?: Record<string, string>
    ): string;
}


export const createApplicationSupportWindowComposition = function(
    options: ApplicationSupportWindowCompositionOptions
) {
    let settingsPreview: Record<string, unknown> | null = null;
    let cancelSettingsPreview = function(): void {
        settingsPreview = null;
    };
    const readVisibleSettings = function(): Record<string, unknown> {
        return settingsPreview || options.readSettings();
    };
    const defaultRuntimeProvider = options.composition.product.defaultRuntimeProvider
        || options.composition.runtime.id;
    const factorySettings = createFactoryApplicationSettings(
        defaultRuntimeProvider
    );
    const getParentWindow = function(): BrowserWindow | null {
        const win = options.getMainWindow();

        return win && !win.isDestroyed() ? win : null;
    };
    const readDialogRegistry = function(registryPath: string): DialogDefinition[] {
        try {
            const parsed = JSON.parse(fs.readFileSync(registryPath, "utf8"));

            return Array.isArray(parsed) ? parsed as DialogDefinition[] : [];
        }
        catch {
            return [];
        }
    };
    const readSharedDialogs = function(): DialogDefinition[] {
        return readDialogRegistry(
            path.join(options.composition.rootDir, "src/base-app/dialogs/dialogs.json")
        );
    };
    const readProductDialogs = function(): DialogDefinition[] {
        if (options.composition.location.source === "base") {
            return [];
        }

        return readDialogRegistry(
            path.join(options.composition.location.rootPath, "dialogs/dialogs.json")
        );
    };
    const menuCustomizationModel = createMenuCustomizationModel({
        menu: options.composition.menu,
        readMenu: function() {
            return options.composition.menu;
        },
        readProductDialogs,
        readSharedDialogs,
        productDialogs: options.composition.productDialogs,
        sharedDialogs: options.composition.sharedDialogs,
        userDialogsDirectory: options.userDialogsDirectory(),
        readSettings: readVisibleSettings
    });
    let createMenuCustomizationWindow: () => BrowserWindow;
    let createDialogRuntimeRequirementsWindow: () => BrowserWindow;
    const languageMenuController = createLanguageMenuController({
        currentLocale: function(): string {
            return options.composition.locale;
        },
        listAvailableLocales: function() {
            return options.composition.availableLocales || [];
        },
        translate: options.translate,
        selectLocale: function(nextLocale): void {
            applyLanguageLive(nextLocale, true);
        }
    });
    const applicationMenuInstaller = createApplicationMenuInstaller({
        composition: options.composition,
        sendMenuCommand: options.sendMenuCommand,
        effectiveApplicationMenu: menuCustomizationModel.effectiveMenu,
        insertLanguageMenu: languageMenuController.insertLanguageMenu,
        authoringFeaturesEnabled: function(): boolean {
            return readVisibleSettings().enableAuthoringFeatures === true;
        },
        translate: options.translate,
        openMenuCustomization: function(): void {
            createMenuCustomizationWindow();
        }
    });
    const runtimeProviderLabel = function(providerId: string): string {
        if (providerId === options.composition.runtime.id) {
            return options.composition.runtime.label || providerId;
        }

        return getRuntimeProvider(providerId, {
            rootDir: options.composition.rootDir,
            productId: options.productId
        }).manifest.label || providerId;
    };
    const readConfiguredRuntimeLocation = function(providerId: string): string {
        const settings = readVisibleSettings();
        const locations = settings.runtimeLocations
            && typeof settings.runtimeLocations === "object"
            && !Array.isArray(settings.runtimeLocations)
            ? settings.runtimeLocations as Record<string, unknown>
            : {};

        return String(locations[providerId] || "").trim();
    };
    const detectsRuntimeAtStartup = function(providerId: string): boolean {
        const settings = readVisibleSettings();
        const detection = settings.runtimeDetectionAtStartup
            && typeof settings.runtimeDetectionAtStartup === "object"
            && !Array.isArray(settings.runtimeDetectionAtStartup)
            ? settings.runtimeDetectionAtStartup as Record<string, unknown>
            : {};

        if (Object.prototype.hasOwnProperty.call(detection, providerId)) {
            return detection[providerId] !== false;
        }

        return !readConfiguredRuntimeLocation(providerId);
    };
    const visibleRuntimeProviders = function() {
        return options.composition.runtimeProviderSelection.choices.filter((choice) => {
            return choice.visible;
        });
    };
    const resolveRuntimeLocationState = async function(
        providerId: string,
        runtimeLocation: string,
        runtimeDetectionAtStartup: boolean
    ) {
        const provider = getRuntimeProvider(providerId, {
            rootDir: options.composition.rootDir,
            productId: options.productId,
            runtimeLocation,
            runtimeDetectionAtStartup
        });

        return provider.locationController
            ? provider.locationController.resolve()
            : Promise.resolve({
                providerId,
                configurable: false,
                configuredPath: "",
                resolvedPath: "",
                source: "unavailable" as const,
                message: "This runtime provider has no local executable."
            });
    };
    const readRuntimeLocationStates = async function() {
        const entries = await Promise.all(visibleRuntimeProviders().map(async (choice) => {
            const location = await resolveRuntimeLocationState(
                choice.id,
                readConfiguredRuntimeLocation(choice.id),
                detectsRuntimeAtStartup(choice.id)
            );

            return [choice.id, location] as const;
        }));

        return Object.fromEntries(entries);
    };
    const settingsWindowController = createSettingsWindowController({
        pagePath: path.join(
            options.composition.rootDir,
            "src/base-app/pages/settings.html"
        ),
        readPayload: async function(): Promise<unknown> {
            return {
                settings: readVisibleSettings(),
                factorySettings,
                locales: options.composition.availableLocales || [],
                runtimeProviders: visibleRuntimeProviders().map((choice) => {
                    return {
                        id: choice.id,
                        label: runtimeProviderLabel(choice.id)
                    };
                }),
                runtimeLocationStates: await readRuntimeLocationStates(),
                selectedRuntimeProvider:
                    options.composition.runtimeProviderSelection.selectedProviderId,
                strings: options.composition.i18n
            };
        },
        onClosed: function(): void {
            cancelSettingsPreview();
        },
        createWindow: createSettingsWindowFactory({
            rootDir: options.composition.rootDir,
            productId: options.productId,
            settingsPath: options.settingsPath,
            title: function(): string {
                return options.translate("Settings");
            },
            nativeWindowIconPath: options.nativeWindowIconPath,
            getParentWindow
        })
    });
    const runtimeRequirementsController =
        createDialogRuntimeRequirementsWindowController({
            pagePath: path.join(
                options.composition.rootDir,
                "src/base-app/pages/dialogRuntimeRequirements.html"
            ),
            readPayload: function(): unknown {
                return createDialogRuntimeRequirementsPayload(
                    options.composition.productDialogs,
                    options.readSettings().dialogRuntimeRequirements,
                    options.composition.i18n
                );
            },
            createWindow: createDialogRuntimeRequirementsWindowFactory({
                productId: options.productId,
                settingsPath: options.settingsPath,
                title: function(): string {
                    return options.translate("Dialog Runtime Requirements");
                },
                nativeWindowIconPath: options.nativeWindowIconPath,
                getParentWindow
            })
        });

    createDialogRuntimeRequirementsWindow = runtimeRequirementsController.open;

    const listMenuAuthoringDialogs = function(): Array<{
        id: string;
        name: string;
        type: "dialog";
    }> {
        const dialogsById = new Map<string, {
            id: string;
            name: string;
            type: "dialog";
        }>();

        options.composition.sharedDialogs
            .concat(options.composition.productDialogs)
            .forEach((definition) => {
                dialogsById.set(definition.id, {
                    id: definition.id,
                    name: String(definition.label || definition.id),
                    type: "dialog"
                });
            });

        try {
            fs.readdirSync(options.userDialogsDirectory())
                .filter((fileName) => {
                    return fileName.toLowerCase().endsWith(".json");
                })
                .forEach((fileName) => {
                    const id = fileName.replace(/\.json$/i, "");
                    const sourcePath = path.join(
                        options.userDialogsDirectory(),
                        fileName
                    );
                    let name = id;

                    try {
                        const parsed = parseNewDialogJson(
                            fs.readFileSync(sourcePath, "utf8")
                        );
                        const properties = parsed?.properties
                            && typeof parsed.properties === "object"
                            ? parsed.properties as unknown as Record<
                                string,
                                unknown
                            >
                            : {};

                        name = String(
                            properties.title || properties.name || id
                        );
                    } catch {
                        return;
                    }

                    dialogsById.set(id, {
                        id,
                        name,
                        type: "dialog"
                    });
                });
        } catch {}

        return Array.from(dialogsById.values()).sort((left, right) => {
            return left.name.localeCompare(right.name);
        });
    };
    const menuCustomizationWindowController =
        createMenuCustomizationWindowController({
            pagePath: path.join(
                options.composition.rootDir,
                "src/base-app/pages/menuCustomize.html"
            ),
            readPayload: function(): unknown {
                return {
                    newItemList: listMenuAuthoringDialogs(),
                    currentMenu: menuCustomizationModel.currentTree(),
                    defaultRuntimeProvider:
                        options.composition.product.defaultRuntimeProvider || "",
                    runtimeProviders:
                        options.composition.product.runtimeProviders || [],
                    strings: options.composition.i18n
                };
            },
            createWindow: createMenuCustomizationWindowFactory({
                rootDir: options.composition.rootDir,
                productId: options.productId,
                settingsPath: options.settingsPath,
                title: function(): string {
                    return options.translate("Customize the menu");
                },
                nativeWindowIconPath: options.nativeWindowIconPath,
                getParentWindow
            })
        });

    createMenuCustomizationWindow = menuCustomizationWindowController.open;

    const buildAboutWindowPayload = function(): AboutWindowPayload {
        const about = options.composition.productAbout;
        const productName = options.composition.product.name;
        const version = String(
            options.composition.product.version || options.app.getVersion()
        );
        const currentYear = new Date().getFullYear();
        const startYear = Number(
            about.copyrightStartYear || currentYear
        );
        const yearText = currentYear > startYear
            ? `${startYear}-${currentYear}`
            : String(startYear);
        const holder = about.copyrightHolder || about.authorName || productName;
        const translateAboutItems = function(
            items: string[],
            keyPrefix: string,
            itemPrefix: string
        ): string[] {
            return items.map((text, index) => {
                const key = `${keyPrefix}.${itemPrefix}${index + 1}`;
                const translated = options.translate(key);

                if (translated !== key) {
                    return translated;
                }

                return options.translate(text);
            });
        };

        return {
            title: options.translate("About {productName}", { productName }),
            version: options.translate("Version {version}", { version }),
            body: translateAboutItems(about.body || [], "about.body", "b"),
            highlights: translateAboutItems(
                about.highlights || [],
                "about.highlights",
                "h"
            ),
            authorLabel: options.translate(about.authorLabel || "Author:"),
            authorName: about.authorName || "",
            authorUrl: about.authorUrl || "",
            copyright: options.translate(
                "Copyright © {yearText}, {holder}",
                { yearText, holder }
            )
        };
    };
    const aboutWindowController = createAboutWindowController({
        pagePath: path.join(
            options.composition.rootDir,
            "src/base-app/pages/about.html"
        ),
        hideMenuBar: true,
        createWindow: createAboutWindowFactory({
            nativeWindowIconPath: options.nativeWindowIconPath,
            getParentWindow
        })
    });
    const createSettingsWindow = settingsWindowController.open;
    const createAboutWindow = function(): BrowserWindow {
        return aboutWindowController.open(buildAboutWindowPayload());
    };
    const applyLanguageLive = function(
        nextLocale: string,
        persist: boolean
    ): void {
        const locale = String(nextLocale || "").trim();

        if (!locale || locale === options.composition.locale) {
            return;
        }

        if (persist) {
            options.writeSettings({
                defaultLanguage: locale,
                languageNS: locale
            });
        }

        options.applyLocale(locale);
        applicationMenuInstaller.install();
        settingsWindowController.refresh();
        runtimeRequirementsController.refresh();
        menuCustomizationWindowController.refresh();
        aboutWindowController.refresh(buildAboutWindowPayload());
        settingsWindowController.getWindow()?.setTitle(
            options.translate("Settings")
        );
        runtimeRequirementsController.getWindow()?.setTitle(
            options.translate("Dialog Runtime Requirements")
        );
        menuCustomizationWindowController.getWindow()?.setTitle(
            options.translate("Customize the menu")
        );
        options.sendToAllWindows(
            applicationEventChannels.languageChanged,
            {
                languageNS: locale,
                language: locale.split(/[-_]/)[0].toLowerCase(),
                appPath: options.composition.rootDir
            }
        );
    };

    const settingsIpcController = createApplicationSettingsIpcController({
        ipcMain: options.ipcMain,
        dialog: options.dialog,
        settingsWindowController,
        menuCustomizationWindowController,
        dialogRuntimeRequirementsWindowController:
            runtimeRequirementsController,
        readSettings: options.readSettings,
        writeSettings: options.writeSettings,
        openSettingsWindow: function(): void {
            createSettingsWindow();
        },
        openMenuCustomizationWindow: function(): void {
            createMenuCustomizationWindow();
        },
        openDialogRuntimeRequirementsWindow: function(): void {
            createDialogRuntimeRequirementsWindow();
        },
        openAboutWindow: function(payload): void {
            aboutWindowController.open(payload);
        },
        buildAboutWindowPayload,
        installApplicationMenu: applicationMenuInstaller.install,
        applyLanguage: function(locale): void {
            applyLanguageLive(locale, false);
        },
        setSettingsPreview: function(settings): void {
            settingsPreview = settings;
        },
        sendToAllWindows: options.sendToAllWindows,
        userDialogsDirectory: options.userDialogsDirectory,
        rootDir: options.composition.rootDir,
        productLocation: options.composition.location,
        defaultRuntimeProvider,
        visibleRuntimeProviderIds:
            options.composition.runtimeProviderSelection.visibleProviderIds,
        discoverRuntimeLocation: function(providerId) {
            return resolveRuntimeLocationState(providerId, "", true);
        },
        translate: options.translate
    });
    cancelSettingsPreview = settingsIpcController.cancelSettingsPreview;

    return {
        installApplicationMenu: applicationMenuInstaller.install,
        createSettingsWindow,
        createDialogRuntimeRequirementsWindow,
        createMenuCustomizationWindow,
        createAboutWindow,
        findDialogDefinition: menuCustomizationModel.findDialog
    };
};

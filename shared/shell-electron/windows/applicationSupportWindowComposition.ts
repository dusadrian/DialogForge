import * as fs from "fs";
import * as path from "path";
import type {
    App,
    BrowserWindow,
    Dialog,
    IpcMain
} from "electron";

import type {
    ApplicationComposition
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
    localeDisplayName
} from "../menus/localeDisplayName";
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
    createDialogRuntimeRequirementsPayload
} from "../../dialog-runtime/requirements/dialogRuntimeRequirements";
import {
    createDialogRuntimeRequirementsWindowController
} from "../../dialog-runtime/requirements/dialogRuntimeRequirementsWindowController";
import {
    createDialogRuntimeRequirementsWindowFactory
} from "../../dialog-runtime/requirements/dialogRuntimeRequirementsWindowFactory";
import {
    createAboutWindowController,
    type AboutWindowPayload
} from "../external/aboutWindowController";
import {
    createAboutWindowFactory
} from "../external/aboutWindowFactory";


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
    const getParentWindow = function(): BrowserWindow | null {
        const win = options.getMainWindow();

        return win && !win.isDestroyed() ? win : null;
    };
    const menuCustomizationModel = createMenuCustomizationModel({
        menu: options.composition.menu,
        readMenu: function() {
            return options.composition.menu;
        },
        productDialogs: options.composition.productDialogs,
        sharedDialogs: options.composition.sharedDialogs,
        userDialogsDirectory: options.userDialogsDirectory(),
        readSettings: options.readSettings
    });
    const listAvailableLocales = function(): Array<{
        code: string;
        label: string;
    }> {
        const localeDirectories = [
            path.join(options.composition.rootDir, "shared/base-app/i18n"),
            options.localePath
        ];
        const codes = new Set<string>(["en_US"]);

        localeDirectories.forEach((directory) => {
            try {
                fs.readdirSync(directory).forEach((fileName) => {
                    if (fileName.toLowerCase().endsWith(".json")) {
                        codes.add(fileName.replace(/\.json$/i, ""));
                    }
                });
            } catch {}
        });

        return Array.from(codes).sort().map((code) => {
            return {
                code,
                label: localeDisplayName(code)
            };
        });
    };

    let createMenuCustomizationWindow: () => BrowserWindow;
    let createDialogRuntimeRequirementsWindow: () => BrowserWindow;
    const languageMenuController = createLanguageMenuController({
        currentLocale: function(): string {
            return options.composition.locale;
        },
        listAvailableLocales,
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
            return options.readSettings().enableAuthoringFeatures === true;
        },
        translate: options.translate,
        openMenuCustomization: function(): void {
            createMenuCustomizationWindow();
        },
        openDialogRuntimeRequirements: function(): void {
            createDialogRuntimeRequirementsWindow();
        }
    });
    const settingsWindowController = createSettingsWindowController({
        pagePath: path.join(
            options.composition.rootDir,
            "shared/base-app/pages/settings.html"
        ),
        readPayload: function(): unknown {
            return {
                settings: options.readSettings(),
                locales: listAvailableLocales(),
                strings: options.composition.i18n
            };
        },
        createWindow: createSettingsWindowFactory({
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
                "shared/base-app/pages/dialogRuntimeRequirements.html"
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
                "shared/base-app/pages/menuCustomize.html"
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
            "shared/base-app/pages/about.html"
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

    createApplicationSettingsIpcController({
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
        sendToAllWindows: options.sendToAllWindows,
        userDialogsDirectory: options.userDialogsDirectory,
        translate: options.translate
    });

    return {
        installApplicationMenu: applicationMenuInstaller.install,
        createSettingsWindow,
        createDialogRuntimeRequirementsWindow,
        createMenuCustomizationWindow,
        createAboutWindow,
        findDialogDefinition: menuCustomizationModel.findDialog
    };
};

import {
    Menu
} from "electron";
import type {
    MenuItemConstructorOptions
} from "electron";
import type {
    ApplicationComposition
} from "../../core/contracts/applicationComposition";
import {
    createApplicationMenuTemplate,
    type SendMenuCommand
} from "./applicationMenu";


export interface ApplicationMenuInstallerOptions {
    composition: ApplicationComposition;
    sendMenuCommand: SendMenuCommand;
    effectiveApplicationMenu(): ApplicationComposition["menu"];
    insertLanguageMenu(
        template: MenuItemConstructorOptions[]
    ): MenuItemConstructorOptions[];
    authoringFeaturesEnabled(): boolean;
    translate(key: string): string;
    openMenuCustomization(): void;
}

export interface ApplicationMenuInstaller {
    install(): void;
}


const addAuthoringMenuItems = function(
    template: MenuItemConstructorOptions[],
    options: ApplicationMenuInstallerOptions
): void {
    if (!options.authoringFeaturesEnabled()) {
        return;
    }

    const appMenu = template.find((item) => {
        return item.id === "App";
    }) || template[0];

    if (!appMenu || !Array.isArray(appMenu.submenu)) {
        return;
    }

    const exitIndex = appMenu.submenu.findIndex((item) => {
        return item.id === "AppExit";
    });

    const itemToInsert: MenuItemConstructorOptions = {
        id: "AppCustomizeMenu",
        label: options.translate("Customize the menu"),
        click: () => {
            options.openMenuCustomization();
        }
    };

    if (exitIndex >= 0) {
        appMenu.submenu.splice(exitIndex, 0, itemToInsert);
    } else {
        appMenu.submenu.push(itemToInsert);
    }
};


const applicationMenuItemIds = new Set([
    "AppSettings",
    "AppCustomizeMenu",
    "AppExit"
]);


export const normalizeTemplateForPlatform = function(
    template: MenuItemConstructorOptions[],
    platform: NodeJS.Platform = process.platform
): MenuItemConstructorOptions[] {
    const appIndex = template.findIndex((item) => {
        return item.id === "App";
    });

    if (platform === "darwin") {
        const result = template.slice();

        if (appIndex >= 0) {
            const [appMenu] = result.splice(appIndex, 1);

            result.unshift(appMenu);
            return result;
        }

        // Arrangements saved before App became a separate root still carry
        // Settings and Exit in File. Move those entries into a native macOS
        // application menu so File remains a visible top-level menu after an
        // upgrade.
        const fileMenu = result.find((item) => {
            return item.id === "File";
        });
        const fileItems = fileMenu && Array.isArray(fileMenu.submenu)
            ? fileMenu.submenu
            : [];
        const appItems = fileItems.filter((item) => {
            return applicationMenuItemIds.has(String(item.id || ""));
        });

        if (fileMenu && Array.isArray(fileMenu.submenu)) {
            fileMenu.submenu = fileItems.filter((item) => {
                return !applicationMenuItemIds.has(String(item.id || ""));
            });
        }

        result.unshift({
            id: "App",
            label: "App",
            submenu: appItems
        });

        return result;
    }

    if (appIndex < 0) {
        return template;
    }

    const appMenu = template[appIndex];
    const appSubmenu = Array.isArray(appMenu.submenu) ? appMenu.submenu : [];
    const result = template.filter((_, idx) => {
        return idx !== appIndex;
    });

    const fileMenu = result.find((item) => {
        return item.id === "File";
    });

    if (fileMenu && Array.isArray(fileMenu.submenu) && appSubmenu.length > 0) {
        fileMenu.submenu.push(
            {
                type: "separator"
            },
            ...appSubmenu
        );
    }

    return result;
};


export const createApplicationMenuInstaller = function(
    options: ApplicationMenuInstallerOptions
): ApplicationMenuInstaller {
    const install = function(): void {
        const effectiveComposition = Object.assign({}, options.composition, {
            menu: options.effectiveApplicationMenu()
        });
        const template = options.insertLanguageMenu(
            createApplicationMenuTemplate(
                effectiveComposition,
                options.sendMenuCommand
            )
        );

        addAuthoringMenuItems(template, options);

        const normalizedTemplate = normalizeTemplateForPlatform(template);

        const menu = Menu.buildFromTemplate(normalizedTemplate);

        Menu.setApplicationMenu(menu);
    };

    return {
        install
    };
};

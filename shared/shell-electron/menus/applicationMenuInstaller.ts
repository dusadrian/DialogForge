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
    openDialogRuntimeRequirements(): void;
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

    const fileMenu = template.find((item) => {
        return item.id === "File";
    });

    if (!fileMenu || !Array.isArray(fileMenu.submenu)) {
        return;
    }

    fileMenu.submenu.push(
        {
            type: "separator"
        },
        {
            id: "AppCustomizeMenu",
            label: options.translate("Customize the menu"),
            click: () => {
                options.openMenuCustomization();
            }
        },
        {
            id: "AppDialogRuntimeRequirements",
            label: options.translate("Dialog Runtime Requirements"),
            click: () => {
                options.openDialogRuntimeRequirements();
            }
        }
    );
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

        const menu = Menu.buildFromTemplate(template);

        Menu.setApplicationMenu(menu);
    };

    return {
        install
    };
};

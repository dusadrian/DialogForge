import type {
    MenuItemConstructorOptions
} from "electron";


export interface AvailableLocale {
    code: string;
    label: string;
}

export interface LanguageMenuControllerOptions {
    currentLocale(): string;
    listAvailableLocales(): AvailableLocale[];
    translate(key: string): string;
    selectLocale(locale: string): void;
}

export interface LanguageMenuController {
    insertLanguageMenu(
        template: MenuItemConstructorOptions[]
    ): MenuItemConstructorOptions[];
}


export const createLanguageMenuController = function(
    options: LanguageMenuControllerOptions
): LanguageMenuController {
    const selectApplicationLocale = function(nextLocale: string): void {
        if (nextLocale === options.currentLocale()) {
            return;
        }

        options.selectLocale(nextLocale);
    };

    const createLanguageMenuTemplate = function():
        MenuItemConstructorOptions | null {
        const locales = options.listAvailableLocales();

        if (locales.length === 0) {
            return null;
        }

        return {
            id: "Language",
            label: options.translate("menu.root.language"),
            submenu: locales.map((availableLocale) => {
                return {
                    id: `Language.${availableLocale.code}`,
                    label: availableLocale.label,
                    type: "radio" as const,
                    checked: availableLocale.code === options.currentLocale(),
                    click: () => {
                        selectApplicationLocale(availableLocale.code);
                    }
                };
            })
        };
    };

    const insertLanguageMenu = function(
        template: MenuItemConstructorOptions[]
    ): MenuItemConstructorOptions[] {
        const languageMenu = createLanguageMenuTemplate();

        if (!languageMenu) {
            return template;
        }

        const withoutExistingLanguage = template.filter((item) => {
            return item.id !== "Language";
        });
        const aboutIndex = withoutExistingLanguage.findIndex((item) => {
            return item.id === "About";
        });

        if (aboutIndex < 0) {
            return withoutExistingLanguage.concat([languageMenu]);
        }

        return withoutExistingLanguage.slice(0, aboutIndex).concat([
            languageMenu,
            ...withoutExistingLanguage.slice(aboutIndex)
        ]);
    };

    return {
        insertLanguageMenu
    };
};

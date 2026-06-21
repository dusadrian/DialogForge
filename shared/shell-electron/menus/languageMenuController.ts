import type {
    MenuItemConstructorOptions
} from "electron";


export interface AvailableLocale {
    code: string;
    label: string;
}

export interface LanguageMenuControllerOptions {
    currentLocale: string;
    currentArgs(): string[];
    listAvailableLocales(): AvailableLocale[];
    translate(key: string): string;
    persistLocale(locale: string): void;
    relaunch(args: string[]): void;
    exit(): void;
}

export interface LanguageMenuController {
    insertLanguageMenu(
        template: MenuItemConstructorOptions[]
    ): MenuItemConstructorOptions[];
}


const localeRelaunchArgs = function(
    args: string[],
    nextLocale: string
): string[] {
    const nextArgs = args.slice();
    const localeIndex = nextArgs.findIndex((arg) => {
        return arg === "--locale";
    });

    if (localeIndex >= 0) {
        if (localeIndex + 1 < nextArgs.length) {
            nextArgs[localeIndex + 1] = nextLocale;
        }
        else {
            nextArgs.push(nextLocale);
        }

        return nextArgs;
    }

    return nextArgs.concat(["--locale", nextLocale]);
};


export const createLanguageMenuController = function(
    options: LanguageMenuControllerOptions
): LanguageMenuController {
    const selectApplicationLocale = function(nextLocale: string): void {
        if (nextLocale === options.currentLocale) {
            return;
        }

        options.persistLocale(nextLocale);
        options.relaunch(localeRelaunchArgs(
            options.currentArgs(),
            nextLocale
        ));
        options.exit();
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
                    checked: availableLocale.code === options.currentLocale,
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

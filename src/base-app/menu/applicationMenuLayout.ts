import type {
    EvaluatedMenuItem
} from "../../core/contracts/applicationComposition";


const applicationMenuItemIds = new Set([
    "AppSettings",
    "AppCustomizeMenu",
    "AppExit"
]);


export const arrangeApplicationMenu = function(
    menu: EvaluatedMenuItem[],
    separateApplicationMenu: boolean
): EvaluatedMenuItem[] {
    const appMenu = menu.find((item) => {
        return item.id === "App";
    });
    const fileMenu = menu.find((item) => {
        return item.id === "File";
    });

    if (separateApplicationMenu) {
        if (appMenu) {
            return [appMenu, ...menu.filter((item) => item !== appMenu)];
        }

        // Older saved arrangements keep these commands in File. A native
        // application menu must precede File on macOS.
        const fileItems = fileMenu?.items || [];
        const appItems = fileItems.filter((item) => {
            return applicationMenuItemIds.has(item.id);
        });
        const remainingItems = fileItems.filter((item) => {
            return !applicationMenuItemIds.has(item.id);
        });

        return [
            {
                id: "App",
                label: "App",
                type: "submenu",
                enabled: true,
                reason: "",
                missing: [],
                items: appItems
            },
            ...menu.map((item) => {
                return item === fileMenu
                    ? { ...item, items: remainingItems }
                    : item;
            })
        ];
    }

    if (!appMenu || !fileMenu) {
        return menu;
    }

    const fileItems = [...(fileMenu.items || [])];
    const appItems = appMenu.items || [];

    if (fileItems.length > 0 && appItems.length > 0) {
        fileItems.push({
            id: "FileApplicationSeparator",
            type: "separator",
            label: "",
            enabled: true,
            reason: "",
            missing: []
        });
    }

    fileItems.push(...appItems);

    return menu.filter((item) => item !== appMenu).map((item) => {
        return item === fileMenu ? { ...item, items: fileItems } : item;
    });
};

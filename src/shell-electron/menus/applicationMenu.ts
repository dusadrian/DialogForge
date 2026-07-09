import type { MenuItemConstructorOptions } from "electron";
import type {
    ApplicationComposition,
    EvaluatedMenuItem
} from "../../core/contracts/applicationComposition";


export type SendMenuCommand = (item: EvaluatedMenuItem) => void;


const isMenuLeaf = function(item: EvaluatedMenuItem): boolean {
    return !Array.isArray(item.items) || item.items.length === 0;
};


const createClickHandler = function(item: EvaluatedMenuItem, sendMenuCommand: SendMenuCommand) {
    return function(): void {
        sendMenuCommand({
            id: item.id,
            label: item.label || item.id || "",
            type: item.type,
            dialog: item.dialog || "",
            command: item.command || "",
            feature: item.feature || "",
            capability: item.capability || "",
            role: item.role || "",
            accelerator: item.accelerator || "",
            enabled: item.enabled !== false,
            reason: item.reason || "",
            missing: item.missing || [],
            rPackages: item.rPackages || [],
            target: item.target || null
        });
    };
};


const createMenuItemTemplate = function(
    item: EvaluatedMenuItem,
    sendMenuCommand: SendMenuCommand
): MenuItemConstructorOptions {
    if (item.type === "separator") {
        return {
            id: item.id,
            type: "separator"
        };
    }

    const template: MenuItemConstructorOptions = {
        id: item.id,
        label: item.label || item.id || "Menu",
        accelerator: item.accelerator || undefined,
        enabled: item.enabled !== false
    };

    if (item.role) {
        template.role = item.role as MenuItemConstructorOptions["role"];
        return template;
    }

    if (!isMenuLeaf(item)) {
        template.submenu = (item.items || []).map((child) => {
            return createMenuItemTemplate(child, sendMenuCommand);
        });

        return template;
    }

    template.click = createClickHandler(item, sendMenuCommand);
    return template;
};


export const createApplicationMenuTemplate = function(
    composition: ApplicationComposition,
    sendMenuCommand: SendMenuCommand
): MenuItemConstructorOptions[] {
    return (composition.menu || []).map((item) => {
        return createMenuItemTemplate(item, sendMenuCommand);
    });
};

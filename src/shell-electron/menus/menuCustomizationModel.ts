import * as fs from "fs";
import * as path from "path";

import type {
    DialogDefinition,
    EvaluatedMenuItem
} from "../../core/contracts/applicationComposition";


export interface MenuCustomizationNode {
    id: string;
    name: string;
    labelKey?: string;
    type: "system" | "dialog" | "submenu";
    position: number;
    subitems?: MenuCustomizationNode[];
    runtimeProvider?: string;
    shortcut?: string;
    dependencies?: string;
    icon?: string;
    builtIn?: boolean;
    locked?: boolean;
}


export interface MenuCustomizationModelOptions {
    menu: EvaluatedMenuItem[];
    readMenu?(): EvaluatedMenuItem[];
    readProductDialogs?(): DialogDefinition[];
    readSharedDialogs?(): DialogDefinition[];
    productDialogs: DialogDefinition[];
    sharedDialogs: DialogDefinition[];
    userDialogsDirectory: string;
    readSettings(): Record<string, unknown>;
}


export interface MenuCustomizationModel {
    effectiveMenu(): EvaluatedMenuItem[];
    currentTree(): MenuCustomizationNode[];
    findDialog(dialogId: string): DialogDefinition | undefined;
}


export const createMenuCustomizationModel = function(
    options: MenuCustomizationModelOptions
): MenuCustomizationModel {
    const readMenu = function(): EvaluatedMenuItem[] {
        return options.readMenu ? options.readMenu() : options.menu;
    };

    const readProductDialogs = function(): DialogDefinition[] {
        return options.readProductDialogs
            ? options.readProductDialogs()
            : options.productDialogs;
    };

    const readSharedDialogs = function(): DialogDefinition[] {
        return options.readSharedDialogs
            ? options.readSharedDialogs()
            : options.sharedDialogs;
    };

    const nodeFromItem = function(
        item: EvaluatedMenuItem,
        position: number
    ): MenuCustomizationNode {
        const isSubmenu = Array.isArray(item.items);
        const isDialog = item.type === "product-dialog"
            || item.type === "shared-dialog";

        return {
            id: isDialog ? String(item.dialog || item.id) : item.id,
            name: item.label,
            labelKey: item.labelKey,
            type: isSubmenu ? "submenu" : isDialog ? "dialog" : "system",
            position,
            runtimeProvider: isDialog
                ? String(item.runtimeProvider || "").trim() || undefined
                : undefined,
            subitems: isSubmenu
                ? (item.items || []).map(nodeFromItem)
                : [],
            shortcut: item.accelerator,
            dependencies: isDialog && Array.isArray(item.rPackages)
                ? item.rPackages.join(", ")
                : undefined,
            builtIn: true,
            locked: true
        };
    };

    const canonicalItems = function(): EvaluatedMenuItem[] {
        const items: EvaluatedMenuItem[] = [];

        const visit = function(nextItems: EvaluatedMenuItem[]): void {
            nextItems.forEach((item) => {
                items.push(item);

                if (Array.isArray(item.items)) {
                    visit(item.items);
                }
            });
        };

        visit(readMenu());

        return items;
    };

    const findCanonicalItem = function(
        node: MenuCustomizationNode
    ): EvaluatedMenuItem | undefined {
        return canonicalItems().find((item) => {
            if (node.type === "dialog") {
                return item.dialog === node.id;
            }

            return item.id === node.id;
        });
    };

    const findDialog = function(
        dialogId: string
    ): DialogDefinition | undefined {
        const registered = readProductDialogs()
            .concat(readSharedDialogs())
            .find((definition) => {
                return definition.id === dialogId;
            });

        if (registered) {
            return registered;
        }

        const sourcePath = path.join(
            options.userDialogsDirectory,
            `${dialogId}.json`
        );

        if (!fs.existsSync(sourcePath)) {
            return undefined;
        }

        return {
            id: dialogId,
            owner: "user",
            label: dialogId,
            sourceFile: sourcePath,
            status: "user-imported"
        };
    };

    const itemFromNode = function(
        node: MenuCustomizationNode
    ): EvaluatedMenuItem | null {
        const canonical = findCanonicalItem(node);

        if (canonical) {
            const label = node.builtIn === true || Boolean(node.labelKey)
                ? canonical.label
                : String(node.name || canonical.label);
            const next = Object.assign({}, canonical, {
                label,
                accelerator: String(
                    node.shortcut || canonical.accelerator || ""
                ) || undefined
            });

            if (node.type === "submenu") {
                next.items = (node.subitems || []).map(itemFromNode).filter(
                    (item): item is EvaluatedMenuItem => Boolean(item)
                );
            }

            return next;
        }

        if (node.type === "submenu") {
            return {
                id: node.id,
                type: "submenu",
                labelKey: node.labelKey,
                label: String(node.name || node.id),
                enabled: true,
                reason: "",
                missing: [],
                items: (node.subitems || []).map(itemFromNode).filter(
                    (item): item is EvaluatedMenuItem => Boolean(item)
                )
            };
        }

        if (node.type !== "dialog") {
            return null;
        }

        const target = findDialog(node.id);

        if (!target) {
            return null;
        }

        return {
            id: `UserDialog.${node.id}`,
            type: "product-dialog",
            dialog: node.id,
            labelKey: node.labelKey,
            label: String(node.name || target.label || node.id),
            accelerator: String(node.shortcut || "") || undefined,
            rPackages: String(node.dependencies || "")
                .split(/[;,\n]/g)
                .map((name) => name.trim())
                .filter(Boolean),
            enabled: true,
            reason: "",
            missing: [],
            target
        };
    };

    const effectiveMenu = function(): EvaluatedMenuItem[] {
        const customization = options.readSettings().menuCustomization;

        if (!Array.isArray(customization)) {
            return readMenu();
        }

        const items = customization.map((value) => {
            return itemFromNode(value as MenuCustomizationNode);
        }).filter((item): item is EvaluatedMenuItem => Boolean(item));

        return items.length > 0 ? items : readMenu();
    };

    const currentTree = function(): MenuCustomizationNode[] {
        const customization = options.readSettings().menuCustomization;

        if (Array.isArray(customization)) {
            return customization as MenuCustomizationNode[];
        }

        return readMenu().map(nodeFromItem);
    };

    return {
        effectiveMenu,
        currentTree,
        findDialog
    };
};

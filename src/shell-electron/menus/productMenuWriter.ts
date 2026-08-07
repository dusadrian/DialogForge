import * as fs from "fs";
import * as path from "path";
import type {
    ResolvedProductLocation
} from "../../core/contracts/productLocation";


// Only the parts of an arranged node this module needs. Keeping it structural
// lets both the customization model and the settings controller pass their own
// node shape without one having to depend on the other.
export interface ArrangedMenuNode {
    id: string;
    name: string;
    type: string;
    shortcut?: string;
    subitems?: ArrangedMenuNode[];
}


// Writing the arranged menu back into the product repository only makes sense
// while a developer is running against a checkout. A packaged application has
// its product staged read-only inside the bundle, so there the arrangement
// stays in user settings.


type ProductMenuItem = {
    id: string;
    labelKey?: string;
    label: string;
    type: string;
    dialog?: string;
    capability?: string;
    accelerator?: string;
    items?: ProductMenuItem[];
    [key: string]: unknown;
};


export const productMenuPath = function(
    location: ResolvedProductLocation
): string {
    if (location.source !== "product" || !location.rootPath) {
        return "";
    }

    return path.join(location.rootPath, "menu", "menu.json");
};


export const canWriteProductMenu = function(options: {
    location: ResolvedProductLocation;
    isPackaged: boolean;
}): boolean {
    if (options.isPackaged) {
        return false;
    }

    const menuPath = productMenuPath(options.location);

    if (!menuPath || !fs.existsSync(menuPath)) {
        return false;
    }

    try {
        fs.accessSync(menuPath, fs.constants.W_OK);
        return true;
    } catch {
        return false;
    }
};


const readJsonArray = function(filePath: string): ProductMenuItem[] {
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
        return Array.isArray(parsed) ? parsed as ProductMenuItem[] : [];
    } catch {
        return [];
    }
};


// Roots such as Data are declared by the base menu and contributed to by the
// product, so ownership cannot be decided by root name. An entry belongs to the
// product when the product's own menu already declares it, or when it is a
// dialog the developer just placed. Everything else is DialogForge's and is
// left out, which also drops purely base roots once they end up empty.


// Existing entries keep the id, labelKey, and capability they were authored
// with; only their arrangement changes. Newly added dialogs get a synthesized
// id and carry no capability until one is declared by hand.
const indexAuthoredItems = function(
    items: ProductMenuItem[],
    byDialog: Map<string, ProductMenuItem>,
    byId: Map<string, ProductMenuItem>
): void {
    items.forEach((item) => {
        if (item.dialog) {
            byDialog.set(String(item.dialog), item);
        }

        if (item.id) {
            byId.set(String(item.id), item);
        }

        if (Array.isArray(item.items)) {
            indexAuthoredItems(item.items, byDialog, byId);
        }
    });
};


const synthesizeItemId = function(dialogId: string): string {
    const cleaned = dialogId.replace(/[^A-Za-z0-9]/g, " ").split(" ")
        .filter(Boolean)
        .map((part) => {
            return part.charAt(0).toUpperCase() + part.slice(1);
        })
        .join("");

    return cleaned ? `Dialog${cleaned}` : dialogId;
};


const itemFromNode = function(
    node: ArrangedMenuNode,
    byDialog: Map<string, ProductMenuItem>,
    byId: Map<string, ProductMenuItem>
): ProductMenuItem | null {
    if (node.type === "submenu") {
        const authored = byId.get(node.id);
        const items = (node.subitems || [])
            .map((child) => {
                return itemFromNode(child, byDialog, byId);
            })
            .filter((item): item is ProductMenuItem => Boolean(item));

        if (items.length === 0) {
            return null;
        }

        return Object.assign({}, authored || {}, {
            id: node.id,
            label: node.name,
            type: "submenu",
            items
        });
    }

    if (node.type !== "dialog") {
        // Not a dialog, so it is only kept when the product already declares
        // it: a product command stays, a base File or Edit entry does not.
        const declared = byId.get(node.id);

        if (!declared) {
            return null;
        }

        return Object.assign({}, declared, {
            id: node.id,
            label: node.name
        });
    }

    const authored = byDialog.get(node.id);
    const item: ProductMenuItem = Object.assign({}, authored || {}, {
        id: authored ? String(authored.id) : synthesizeItemId(node.id),
        label: node.name,
        type: authored ? String(authored.type) : "product-dialog",
        dialog: node.id
    });

    if (node.shortcut) {
        item.accelerator = node.shortcut;
    }

    return item;
};


export const writeProductMenu = function(options: {
    location: ResolvedProductLocation;
    nodes: ArrangedMenuNode[];
}): { written: boolean; path: string; itemCount: number } {
    const menuPath = productMenuPath(options.location);

    if (!menuPath) {
        return { written: false, path: "", itemCount: 0 };
    }

    const authored = readJsonArray(menuPath);
    const byDialog = new Map<string, ProductMenuItem>();
    const byId = new Map<string, ProductMenuItem>();
    indexAuthoredItems(authored, byDialog, byId);

    const productRoots = options.nodes
        .map((node) => {
            return itemFromNode(node, byDialog, byId);
        })
        .filter((item): item is ProductMenuItem => Boolean(item));

    fs.writeFileSync(
        menuPath,
        `${JSON.stringify(productRoots, null, 4)}\n`,
        "utf8"
    );

    return {
        written: true,
        path: menuPath,
        itemCount: productRoots.length
    };
};

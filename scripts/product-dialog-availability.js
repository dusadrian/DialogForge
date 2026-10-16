"use strict";

const fs = require("node:fs");
const path = require("node:path");


const applyProductDialogAvailability = function(productRoot, profile) {
    if (profile !== "development" && profile !== "release") {
        throw new Error(`Unknown desktop build profile: ${profile}`);
    }

    const packagePath = path.join(productRoot, "package.json");
    const manifest = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    const availability = manifest.product?.dialogAvailability;
    if (availability === undefined) {
        return;
    }
    if (!availability || typeof availability !== "object" || Array.isArray(availability)) {
        throw new Error("product.dialogAvailability must be an object keyed by dialog id.");
    }

    const registryPath = path.join(productRoot, "dialogs/dialogs.json");
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    const disabled = new Set();
    for (const [id, profiles] of Object.entries(availability)) {
        if (!registry.some((dialog) => dialog.id === id)) {
            throw new Error(`product.dialogAvailability refers to unknown dialog: ${id}`);
        }
        if (!profiles || typeof profiles.development !== "boolean" || typeof profiles.release !== "boolean") {
            throw new Error(`Dialog ${id} must declare boolean development and release availability.`);
        }
        if (!profiles[profile]) {
            disabled.add(id);
        }
    }
    if (!disabled.size) {
        return;
    }

    const filterMenu = function(items) {
        return items.flatMap((item) => {
            if (disabled.has(item.dialog)) {
                return [];
            }
            if (Array.isArray(item.items)) {
                const children = filterMenu(item.items);
                return children.length ? [{ ...item, items: children }] : [];
            }
            return [item];
        });
    };
    const menuPath = path.join(productRoot, "menu/menu.json");
    const menu = JSON.parse(fs.readFileSync(menuPath, "utf8"));
    fs.writeFileSync(registryPath, JSON.stringify(
        registry.filter((dialog) => !disabled.has(dialog.id)), null, 4
    ) + "\n");
    fs.writeFileSync(menuPath, JSON.stringify(filterMenu(menu), null, 4) + "\n");
    console.log(`Excluded ${profile} dialogs: ${[...disabled].join(", ")}`);
};


module.exports = { applyProductDialogAvailability };

// Where a saved menu arrangement lives in settings.
//
// In a packaged app every product owns its userData directory, so an unscoped
// key was unambiguous. In development every product runs from the same Electron
// binary and therefore shares one settings file -- the same file already holds
// consoleHistory.<product>.<runtime> entries for each of them -- so an unscoped
// menuCustomization written while running one product was picked up by the
// next, and a product rendered another product's menu.


export const legacyMenuCustomizationKey = "menuCustomization";


export const menuCustomizationSettingsKey = function(productId: unknown): string {
    const id = String(productId ?? "").trim();

    return id
        ? `${legacyMenuCustomizationKey}.${id}`
        : legacyMenuCustomizationKey;
};


export interface ReadMenuCustomizationOptions {
    settings: Record<string, unknown>;
    productId: unknown;
    // Only a packaged app may adopt the unscoped key: there, userData is per
    // product, so the arrangement can only have come from this product. In
    // development the same key may belong to any product that ran before.
    isPackaged: boolean;
}


export const readMenuCustomizationSetting = function(
    options: ReadMenuCustomizationOptions
): unknown {
    const scoped = options.settings[
        menuCustomizationSettingsKey(options.productId)
    ];

    if (Array.isArray(scoped)) {
        return scoped;
    }

    const legacy = options.settings[legacyMenuCustomizationKey];

    return options.isPackaged && Array.isArray(legacy)
        ? legacy
        : undefined;
};

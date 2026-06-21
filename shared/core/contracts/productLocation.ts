export interface ResolvedProductLocation {
    id: string;
    source: "base" | "product";

    // Path to the product's directory (containing product.json, menu/, dialogs/, etc.)
    rootPath: string;

    // Path to the product's compiled JS artifacts (specifically bootstrap/productContribution.js)
    // For products, this is DialogForge's staged root or the source root for plain JavaScript.
    compiledRootPath: string;

    // Convenience paths
    manifestPath: string;
    settingsPath: string;
    i18nPath: string;
    assetsPath: string;
}

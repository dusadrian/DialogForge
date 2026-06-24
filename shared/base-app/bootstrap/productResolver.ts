import * as fs from "fs";
import * as path from "path";
import type {
    ResolvedProductLocation
} from "../../core/contracts/productLocation";


const readProductManifest = function(manifestPath: string): Record<string, unknown> {
    let parsed: unknown;

    try {
        parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    }
    catch (error: any) {
        throw new Error(
            `Product validation failed: Could not read product manifest at "${manifestPath}".\n` +
            error.message
        );
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(
            `Product validation failed: Product manifest at "${manifestPath}" must be a JSON object.`
        );
    }

    return parsed as Record<string, unknown>;
};


export const resolveProductLocation = function(
    rootDir: string,
    productId: string,
    productPath?: string
): ResolvedProductLocation {
    const requestedProductId = String(productId || "base").trim() || "base";

    if (requestedProductId === "base" && !productPath) {
        return {
            id: "base",
            source: "base",
            rootPath: "",
            compiledRootPath: "",
            manifestPath: "",
            settingsPath: path.join(
                rootDir,
                "shared/base-app/settings/settings.json"
            ),
            i18nPath: path.join(rootDir, "shared/base-app/i18n"),
            assetsPath: ""
        };
    }

    if (!productPath) {
        throw new Error(
            `Product validation failed: Product "${requestedProductId}" was requested by id, but products must be selected with --product-path.`
        );
    }

    const resolvedRoot = path.resolve(productPath);
    const manifestPath = path.join(resolvedRoot, "product.json");

    if (!fs.existsSync(manifestPath)) {
        throw new Error(
            `Product validation failed: Could not find product manifest at "${manifestPath}".\n` +
            `Ensure the path is correct and contains a valid product.json.`
        );
    }

    const manifest = readProductManifest(manifestPath);
    const manifestId = String(manifest.id || "").trim();
    const resolvedProductId = manifestId || requestedProductId;

    if (!resolvedProductId || resolvedProductId === "base") {
        throw new Error(
            `Product validation failed: Product manifest at "${manifestPath}" must define a non-base id.`
        );
    }

    const stagedRootPath = path.join(rootDir, "products", resolvedProductId);
    const distStagedRootPath = path.join(rootDir, "dist/products", resolvedProductId);
    const compiledRootPath = [
        stagedRootPath,
        distStagedRootPath,
        resolvedRoot
    ].find((candidateRootPath) => {
        return fs.existsSync(
            path.join(candidateRootPath, "bootstrap/productContribution.js")
        );
    });

    return {
        id: resolvedProductId,
        source: "product",
        rootPath: resolvedRoot,
        compiledRootPath: compiledRootPath || resolvedRoot,
        manifestPath,
        settingsPath: path.join(resolvedRoot, "settings/settings.json"),
        i18nPath: path.join(resolvedRoot, "i18n"),
        assetsPath: path.join(resolvedRoot, "assets")
    };
};

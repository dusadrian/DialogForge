import * as fs from "fs";
import * as path from "path";
import type {
    ResolvedProductLocation
} from "../../core/contracts/productLocation";
import {
    productManifestPath,
    readProductManifest
} from "./productManifestReader";


const productContributionPath = function(rootPath: string): string {
    return path.join(rootPath, "bootstrap/productContribution.js");
};


const stagedProductRootCandidates = function(
    rootDir: string,
    productId: string
): string[] {
    const normalizedRoot = path.resolve(rootDir);
    const sourceRoot = path.basename(normalizedRoot) === "dist"
        ? path.dirname(normalizedRoot)
        : normalizedRoot;
    const distRoot = path.basename(normalizedRoot) === "dist"
        ? normalizedRoot
        : path.join(normalizedRoot, "dist");

    return [
        path.join(sourceRoot, "products", productId),
        path.join(distRoot, "product")
    ];
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
                "src/base-app/settings/settings.json"
            ),
            i18nPath: path.join(rootDir, "src/base-app/i18n"),
            assetsPath: ""
        };
    }

    if (!productPath) {
        throw new Error(
            `Product validation failed: Product "${requestedProductId}" was requested by id, but products must be selected with --product-path.`
        );
    }

    const resolvedRoot = path.resolve(productPath);
    const manifestPath = productManifestPath(resolvedRoot);

    if (!fs.existsSync(manifestPath)) {
        throw new Error(
            `Product validation failed: Could not find product package at "${manifestPath}".\n` +
            `Ensure the path is correct and contains a valid package.json.`
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

    const compiledRootPath = [
        ...stagedProductRootCandidates(rootDir, resolvedProductId),
        resolvedRoot
    ].find((candidateRootPath) => {
        return fs.existsSync(
            productContributionPath(candidateRootPath)
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

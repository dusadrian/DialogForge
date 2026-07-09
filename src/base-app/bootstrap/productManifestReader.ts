import * as fs from "fs";
import * as path from "path";


const readJsonObject = function(filePath: string): Record<string, unknown> {
    let parsed: unknown;

    try {
        parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
    catch (error: any) {
        throw new Error(
            `Product validation failed: Could not read product package at "${filePath}".\n` +
            error.message
        );
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(
            `Product validation failed: Product package at "${filePath}" must be a JSON object.`
        );
    }

    return parsed as Record<string, unknown>;
};


const readObject = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
};


export const productManifestPath = function(productRoot: string): string {
    return path.join(productRoot, "package.json");
};


export const readProductManifest = function(packagePath: string): Record<string, unknown> {
    const packageJson = readJsonObject(packagePath);
    const product = readObject(packageJson.product);

    if (Object.keys(product).length === 0) {
        throw new Error(
            `Product validation failed: Product package at "${packagePath}" must define a product object.`
        );
    }

    const productName = String(
        product.name
            || product.displayName
            || packageJson.productName
            || packageJson.name
            || ""
    ).trim();

    return {
        ...product,
        name: productName,
        version: String(packageJson.version || "").trim(),
        description: String(packageJson.description || "").trim()
    };
};

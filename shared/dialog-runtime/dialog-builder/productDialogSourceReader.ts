import * as fs from "fs";
import * as path from "path";
import {
    normalizeNewDialogForRuntime,
    parseNewDialogJson
} from "../renderer/modules/dialogAdapter";
import type {
    ProductDialogDefinition
} from "./productDialogWindowController";


export interface ProductDialogSourceDefinition {
    sourceFile?: string;
    owner?: string;
    rPackages?: string[];
}


export interface ProductDialogSourceReaderOptions {
    rootDir: string;
    productId: string;
    findDefinition(
        dialogId: string
    ): ProductDialogSourceDefinition | null | undefined;
}


const readDialogCustomJS = function(
    sourcePath: string,
    parsed: Record<string, unknown>
): string {
    const embedded = typeof parsed.customJS === "string"
        ? parsed.customJS
        : "";

    if (embedded.trim()) {
        return embedded;
    }

    const script = parsed.script
        && typeof parsed.script === "object"
        && !Array.isArray(parsed.script)
            ? parsed.script as Record<string, unknown>
            : {};
    const entry = String(script.entry || "").trim();

    if (!entry) {
        return "";
    }

    const sourceDirectory = path.dirname(sourcePath);
    const scriptPath = path.resolve(sourceDirectory, entry);
    const relativePath = path.relative(sourceDirectory, scriptPath);

    if (
        !relativePath
        || relativePath.startsWith(".." + path.sep)
        || path.isAbsolute(relativePath)
    ) {
        throw new Error(
            `Dialog script must stay inside its source directory: ${entry}`
        );
    }

    if (!fs.existsSync(scriptPath)) {
        throw new Error(
            `Dialog script is not available: ${scriptPath}`
        );
    }

    return fs.readFileSync(scriptPath, "utf8");
};


const mergeDialogDependencies = function(
    parsed: Record<string, unknown>,
    definition: ProductDialogSourceDefinition
): void {
    const properties = parsed.properties
        && typeof parsed.properties === "object"
        && !Array.isArray(parsed.properties)
            ? parsed.properties as Record<string, unknown>
            : {};
    const declared = String(properties.dependencies || "")
        .split(/[;,\n]/g)
        .map((name) => name.trim())
        .filter(Boolean);
    const required = Array.isArray(definition.rPackages)
        ? definition.rPackages.map((name) => String(name).trim()).filter(Boolean)
        : [];

    properties.dependencies = Array.from(new Set(
        declared.concat(required)
    )).join("; ");
    parsed.properties = properties;
};


export const createProductDialogSourceReader = function(
    options: ProductDialogSourceReaderOptions
) {
    return function(dialogId: string): ProductDialogDefinition {
        const definition = options.findDefinition(dialogId);

        if (!definition?.sourceFile) {
            throw new Error(
                `Dialog source is not registered: ${dialogId}`
            );
        }

        const sourcePath = path.isAbsolute(definition.sourceFile)
            ? definition.sourceFile
            : definition.owner === "shared/base-app"
                ? path.join(
                    options.rootDir,
                    "shared",
                    "base-app",
                    "dialogs",
                    definition.sourceFile
                )
                : path.join(
                    options.rootDir,
                    "products",
                    options.productId,
                    "dialogs",
                    definition.sourceFile
                );
        const raw = fs.readFileSync(sourcePath, "utf8");
        const parsed = parseNewDialogJson(raw);
        const source = parsed as unknown as Record<string, unknown>;
        mergeDialogDependencies(source, definition);
        source.customJS = readDialogCustomJS(sourcePath, source);

        return normalizeNewDialogForRuntime(
            parsed
        ) as unknown as ProductDialogDefinition;
    };
};

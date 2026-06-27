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
    productRootPath?: string;
    findDefinition(
        dialogId: string
    ): ProductDialogSourceDefinition | null | undefined;
    getLocale(): string;
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


const asRecord = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
};


const localizeDialogSource = function(
    source: Record<string, unknown>,
    requestedLocale: string
): void {
    const i18n = asRecord(source.i18n);
    const locales = asRecord(i18n.locales);
    const availableLocales = Object.keys(locales);
    const requested = String(requestedLocale || "").trim();
    const language = requested.split(/[-_]/)[0].toLowerCase();
    const selectedLocale = availableLocales.includes(requested)
        ? requested
        : availableLocales.find((locale) => {
            return locale.split(/[-_]/)[0].toLowerCase() === language;
        }) || String(i18n.baseLocale || "").trim();
    const translations = asRecord(locales[selectedLocale]);

    if (Object.keys(translations).length === 0) {
        return;
    }

    const properties = asRecord(source.properties);
    const title = String(translations["dialog.title"] || "").trim();

    if (title) {
        properties.title = title;
    }
    properties.language = selectedLocale;
    source.properties = properties;

    if (!Array.isArray(source.elements)) {
        return;
    }

    source.elements.forEach((value) => {
        const element = asRecord(value);
        const id = String(element.id || "").trim();

        if (!id) {
            return;
        }

        ["label", "value"].forEach((property) => {
            const key = `elements.${id}.${property}`;

            if (Object.prototype.hasOwnProperty.call(translations, key)) {
                if (
                    property === "value"
                    && !Object.prototype.hasOwnProperty.call(
                        element,
                        "__baseValue"
                    )
                ) {
                    element.__baseValue = String(element.value ?? "");
                }

                element[property] = String(translations[key] ?? "");
            }
        });
    });
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
                    options.productRootPath
                        || path.join(options.rootDir, "products", options.productId),
                    "dialogs",
                    definition.sourceFile
                );
        const raw = fs.readFileSync(sourcePath, "utf8");
        const parsed = parseNewDialogJson(raw);
        const source = parsed as unknown as Record<string, unknown>;
        mergeDialogDependencies(source, definition);
        source.customJS = readDialogCustomJS(sourcePath, source);
        localizeDialogSource(source, options.getLocale());

        return normalizeNewDialogForRuntime(
            parsed
        ) as unknown as ProductDialogDefinition;
    };
};

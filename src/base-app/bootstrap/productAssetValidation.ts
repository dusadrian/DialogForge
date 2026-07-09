import * as fs from "fs";
import * as path from "path";


export interface ProductAssetValidationOptions {
    required?: boolean;
}


type JsonSchemaTypeName =
    | "array"
    | "boolean"
    | "null"
    | "number"
    | "object"
    | "string";


interface JsonSchemaDefinition {
    type?: JsonSchemaTypeName | JsonSchemaTypeName[];
    required?: string[];
    properties?: Record<string, JsonSchemaDefinition>;
    items?: JsonSchemaDefinition;
    anyOf?: JsonSchemaDefinition[];
    additionalProperties?: boolean | JsonSchemaDefinition;
}


const jsonPosition = function(error: unknown): number {
    const message = error instanceof Error ? error.message : String(error);
    const match = /\bposition\s+(\d+)\b/.exec(message);

    return match ? Number(match[1]) : -1;
};


const jsonLineColumn = function(source: string, position: number) {
    if (!Number.isFinite(position) || position < 0) {
        return "";
    }

    const before = source.slice(0, position);
    const line = before.split("\n").length;
    const column = before.length - before.lastIndexOf("\n");

    return ` at line ${String(line)}, column ${String(column)}`;
};


const describeJsonFailure = function(
    filePath: string,
    purpose: string,
    detail: string
) {
    return `${purpose} validation failed for "${filePath}": ${detail}`;
};


const isRecord = function(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};


export const readJsonForValidation = function(
    filePath: string,
    purpose: string,
    options: ProductAssetValidationOptions = {}
): unknown {
    if (!fs.existsSync(filePath)) {
        if (options.required === true) {
            throw new Error(
                describeJsonFailure(filePath, purpose, "file does not exist.")
            );
        }

        return undefined;
    }

    const source = fs.readFileSync(filePath, "utf8");

    try {
        return JSON.parse(source);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const location = jsonLineColumn(source, jsonPosition(error));

        throw new Error(
            describeJsonFailure(
                filePath,
                purpose,
                `invalid JSON${location}: ${message}`
            )
        );
    }
};


const schemaRootPath = function(): string {
    const candidates = [
        path.resolve(__dirname, "../../../schemas"),
        path.resolve(__dirname, "../../../../schemas")
    ];

    const found = candidates.find((candidate) => {
        return fs.existsSync(path.join(candidate, "dialog.schema.json"));
    });

    if (!found) {
        throw new Error(
            "Could not locate DialogForge JSON schemas. Checked: " +
            candidates.join(", ")
        );
    }

    return found;
};


const readJsonSchema = function(fileName: string): JsonSchemaDefinition {
    return readJsonForValidation(
        path.join(schemaRootPath(), fileName),
        "JSON schema",
        { required: true }
    ) as JsonSchemaDefinition;
};


const schemaValueType = function(value: unknown): JsonSchemaTypeName {
    if (value === null) {
        return "null";
    }

    if (Array.isArray(value)) {
        return "array";
    }

    return typeof value as JsonSchemaTypeName;
};


const schemaPath = function(pathParts: string[]): string {
    return pathParts.length === 0
        ? "$"
        : "$." + pathParts.join(".");
};


const schemaFailure = function(
    filePath: string,
    pathParts: string[],
    detail: string
): string {
    return describeJsonFailure(
        filePath,
        "Dialog source schema",
        `${schemaPath(pathParts)} ${detail}`
    );
};


const schemaTypeList = function(schema: JsonSchemaDefinition): JsonSchemaTypeName[] {
    if (!schema.type) {
        return [];
    }

    return Array.isArray(schema.type)
        ? schema.type
        : [schema.type];
};


const assertSchemaType = function(
    filePath: string,
    value: unknown,
    schema: JsonSchemaDefinition,
    pathParts: string[]
): void {
    const expectedTypes = schemaTypeList(schema);

    if (expectedTypes.length === 0) {
        return;
    }

    const actualType = schemaValueType(value);

    if (!expectedTypes.includes(actualType)) {
        throw new Error(
            schemaFailure(
                filePath,
                pathParts,
                `must be ${expectedTypes.join(" or ")}; found ${actualType}.`
            )
        );
    }
};


const validateRequiredProperties = function(
    filePath: string,
    value: unknown,
    schema: JsonSchemaDefinition,
    pathParts: string[]
): void {
    if (!isRecord(value) || !Array.isArray(schema.required)) {
        return;
    }

    schema.required.forEach((propertyName) => {
        if (!Object.prototype.hasOwnProperty.call(value, propertyName)) {
            throw new Error(
                schemaFailure(
                    filePath,
                    pathParts,
                    `must define ${propertyName}.`
                )
            );
        }
    });
};


const validateKnownProperties = function(
    filePath: string,
    value: unknown,
    schema: JsonSchemaDefinition,
    pathParts: string[]
): void {
    if (!isRecord(value) || !schema.properties) {
        return;
    }

    Object.entries(schema.properties).forEach(([propertyName, propertySchema]) => {
        if (Object.prototype.hasOwnProperty.call(value, propertyName)) {
            validateJsonSchemaValue(
                filePath,
                value[propertyName],
                propertySchema,
                pathParts.concat(propertyName)
            );
        }
    });
};


const validateAdditionalProperties = function(
    filePath: string,
    value: unknown,
    schema: JsonSchemaDefinition,
    pathParts: string[]
): void {
    if (
        !isRecord(value)
        || schema.additionalProperties === undefined
        || schema.additionalProperties === true
    ) {
        return;
    }

    const known = new Set(Object.keys(schema.properties || {}));

    Object.entries(value).forEach(([propertyName, propertyValue]) => {
        if (known.has(propertyName)) {
            return;
        }

        if (schema.additionalProperties === false) {
            throw new Error(
                schemaFailure(
                    filePath,
                    pathParts.concat(propertyName),
                    "is not allowed."
                )
            );
        }

        const additionalPropertySchema = schema.additionalProperties;

        if (typeof additionalPropertySchema === "object") {
            validateJsonSchemaValue(
                filePath,
                propertyValue,
                additionalPropertySchema,
                pathParts.concat(propertyName)
            );
        }
    });
};


const validateAnyOf = function(
    filePath: string,
    value: unknown,
    schema: JsonSchemaDefinition,
    pathParts: string[]
): void {
    if (!Array.isArray(schema.anyOf) || schema.anyOf.length === 0) {
        return;
    }

    const matched = schema.anyOf.some((candidateSchema) => {
        try {
            validateJsonSchemaValue(filePath, value, candidateSchema, pathParts);
            return true;
        }
        catch {
            return false;
        }
    });

    if (!matched) {
        throw new Error(
            schemaFailure(filePath, pathParts, "does not match any allowed shape.")
        );
    }
};


function validateJsonSchemaValue(
    filePath: string,
    value: unknown,
    schema: JsonSchemaDefinition,
    pathParts: string[]
): void {
    assertSchemaType(filePath, value, schema, pathParts);
    validateRequiredProperties(filePath, value, schema, pathParts);
    validateKnownProperties(filePath, value, schema, pathParts);
    validateAdditionalProperties(filePath, value, schema, pathParts);
    validateAnyOf(filePath, value, schema, pathParts);

    if (Array.isArray(value) && schema.items) {
        value.forEach((entry, index) => {
            validateJsonSchemaValue(
                filePath,
                entry,
                schema.items as JsonSchemaDefinition,
                pathParts.concat(String(index))
            );
        });
    }
}


const validateDialogSchema = function(filePath: string, parsed: unknown): void {
    validateJsonSchemaValue(
        filePath,
        parsed,
        readJsonSchema("dialog.schema.json"),
        []
    );
};


export const validateLocaleFile = function(filePath: string): void {
    const parsed = readJsonForValidation(filePath, "Locale file", {
        required: true
    });

    if (!isRecord(parsed)) {
        throw new Error(
            describeJsonFailure(filePath, "Locale file", "root must be an object.")
        );
    }

    Object.entries(parsed).forEach(([key, value]) => {
        if (typeof value !== "string") {
            throw new Error(
                describeJsonFailure(
                    filePath,
                    "Locale file",
                    `key "${key}" must contain a string value.`
                )
            );
        }
    });
};


export const validateI18nDirectory = function(directoryPath: string): void {
    if (!fs.existsSync(directoryPath)) {
        return;
    }

    fs.readdirSync(directoryPath, {
        withFileTypes: true
    }).forEach((entry) => {
        if (entry.isFile() && entry.name.endsWith(".json")) {
            validateLocaleFile(path.join(directoryPath, entry.name));
        }
    });
};


const validateDialogProperties = function(
    filePath: string,
    value: unknown
): void {
    if (!isRecord(value)) {
        throw new Error(
            describeJsonFailure(
                filePath,
                "Dialog source",
                "properties must be an object."
            )
        );
    }

    const name = String(value.name || "").trim();
    const title = String(value.title || "").trim();

    if (!name) {
        throw new Error(
            describeJsonFailure(
                filePath,
                "Dialog source",
                "properties.name must be a non-empty string."
            )
        );
    }

    if (!title) {
        throw new Error(
            describeJsonFailure(
                filePath,
                "Dialog source",
                "properties.title must be a non-empty string."
            )
        );
    }
};


const validateDialogElements = function(
    filePath: string,
    value: unknown
): void {
    if (!Array.isArray(value)) {
        throw new Error(
            describeJsonFailure(
                filePath,
                "Dialog source",
                "elements must be an array."
            )
        );
    }

    value.forEach((entry, index) => {
        if (!isRecord(entry)) {
            throw new Error(
                describeJsonFailure(
                    filePath,
                    "Dialog source",
                    `elements[${String(index)}] must be an object.`
                )
            );
        }

        const type = String(entry.type || "").trim();
        const id = String(entry.id || "").trim();
        const name = String(entry.nameid || entry.name || "").trim();

        if (!type) {
            throw new Error(
                describeJsonFailure(
                    filePath,
                    "Dialog source",
                    `elements[${String(index)}].type must be a non-empty string.`
                )
            );
        }

        if (!id && !name) {
            throw new Error(
                describeJsonFailure(
                    filePath,
                    "Dialog source",
                    `elements[${String(index)}] must define id, name, or nameid.`
                )
            );
        }
    });
};


const validateDialogI18n = function(
    filePath: string,
    value: unknown
): void {
    if (value === undefined) {
        return;
    }

    if (!isRecord(value)) {
        throw new Error(
            describeJsonFailure(filePath, "Dialog source", "i18n must be an object.")
        );
    }

    const locales = value.locales;

    if (locales === undefined) {
        return;
    }

    if (!isRecord(locales)) {
        throw new Error(
            describeJsonFailure(
                filePath,
                "Dialog source",
                "i18n.locales must be an object."
            )
        );
    }

    Object.entries(locales).forEach(([locale, translations]) => {
        if (!isRecord(translations)) {
            throw new Error(
                describeJsonFailure(
                    filePath,
                    "Dialog source",
                    `i18n.locales.${locale} must be an object.`
                )
            );
        }

        Object.entries(translations).forEach(([key, text]) => {
            if (typeof text !== "string") {
                throw new Error(
                    describeJsonFailure(
                        filePath,
                        "Dialog source",
                        `i18n.locales.${locale}.${key} must be a string.`
                    )
                );
            }
        });
    });
};


export const validateDialogSourceFile = function(filePath: string): void {
    const parsed = readJsonForValidation(filePath, "Dialog source", {
        required: true
    });

    if (!isRecord(parsed)) {
        throw new Error(
            describeJsonFailure(filePath, "Dialog source", "root must be an object.")
        );
    }

    validateDialogSchema(filePath, parsed);
    validateDialogProperties(filePath, parsed.properties);
    validateDialogElements(filePath, parsed.elements);
    validateDialogI18n(filePath, parsed.i18n);
};


export const validateDialogRegistry = function(
    registryPath: string,
    dialogsRoot: string
): void {
    const parsed = readJsonForValidation(registryPath, "Dialog registry", {
        required: true
    });

    if (!Array.isArray(parsed)) {
        throw new Error(
            describeJsonFailure(
                registryPath,
                "Dialog registry",
                "root must be an array."
            )
        );
    }

    parsed.forEach((entry, index) => {
        if (!isRecord(entry)) {
            throw new Error(
                describeJsonFailure(
                    registryPath,
                    "Dialog registry",
                    `entry ${String(index + 1)} must be an object.`
                )
            );
        }

        const id = String(entry.id || "").trim();
        const sourceFile = String(entry.sourceFile || "").trim();

        if (!id) {
            throw new Error(
                describeJsonFailure(
                    registryPath,
                    "Dialog registry",
                    `entry ${String(index + 1)} must define id.`
                )
            );
        }

        if (sourceFile) {
            validateDialogSourceFile(path.join(dialogsRoot, sourceFile));
        }
    });
};

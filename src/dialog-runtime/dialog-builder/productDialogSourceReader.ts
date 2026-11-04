import { localizeDialogSource } from "./dialogSourceLocalization";
import * as fs from "fs";
import * as path from "path";
import {
    normalizeNewDialogForRuntime,
    parseNewDialogJson
} from "../renderer/modules/dialogAdapter";
import type {
    ProductDialogDefinition
} from "./productDialogDefinition";
import type {
    RPackageRequirement
} from "../../core/contracts/applicationComposition";
import {
    mergeRPackageRequirements,
    normalizeRPackageRequirementsAtIngestion
} from "../../runtime/providers/r/dependencies/rPackageCompatibility";
import {
    readDialogCustomJSSource
} from "../dialogCustomJSSource";


export interface ProductDialogSourceDefinition {
    sourceFile?: string;
    owner?: string;
    rPackages?: RPackageRequirement[];
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
    const requirements = mergeRPackageRequirements(
        normalizeRPackageRequirementsAtIngestion(
            properties.rPackageRequirements
        ),
        definition.rPackages || []
    );
    const required = requirements.map((requirement) => {
        return String(requirement.name || "").trim();
    }).filter(Boolean);

    properties.dependencies = Array.from(new Set(
        declared.concat(required)
    )).join("; ");
    properties.rPackageRequirements = requirements;
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
            : definition.owner === "src/base-app"
                ? path.join(
                    options.rootDir,
                    "src",
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
        source.customJS = readDialogCustomJSSource(sourcePath, source);
        localizeDialogSource(source, options.getLocale());

        return normalizeNewDialogForRuntime(
            parsed
        ) as unknown as ProductDialogDefinition;
    };
};

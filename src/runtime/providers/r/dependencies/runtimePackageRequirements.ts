import {
    parseRPackageList
} from "../commands/rCommandIntents";
import type {
    RPackageRequirement
} from "../../../../core/contracts/applicationComposition";
import {
    createRPackageRequirementsFromNames,
    mergeRPackageRequirements,
    normalizeRPackageRequirementsAtIngestion
} from "./rPackageCompatibility";


export interface RuntimePackageStatus {
    missing: string[];
    attached: string[];
}


export const createRMissingPackageMessage = function(packages: unknown): string {
    const missing = parseRPackageList(packages);

    return missing.length
        ? `Required package(s) not installed: ${missing.join(", ")}`
        : "Required package(s) not installed.";
};


export const createRPackageLoadFailureMessage = function(packageName: unknown): string {
    const [normalized] = parseRPackageList([packageName]);

    return normalized
        ? `Could not load R package: ${normalized}`
        : "Could not load R package.";
};


const readRecord = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
};


const readNestedRecord = function(value: unknown, key: string): Record<string, unknown> {
    return readRecord(readRecord(value)[key]);
};


const createRCharacterVector = function(values: string[]): string {
    return `c(${values.map((value) => {
        return JSON.stringify(value);
    }).join(", ")})`;
};


export const readRDialogPackageRequirements = function(
    dialogPayload: unknown,
    requirementsByDialogId: Record<string, unknown> = {}
): RPackageRequirement[] {
    const definition = readNestedRecord(dialogPayload, "definition");
    const source = readNestedRecord(dialogPayload, "source");
    const sourceProperties = readNestedRecord(source, "properties");
    const runtimeRequirements = readNestedRecord(dialogPayload, "runtimeRequirements");
    const dialogId = String(
        definition.id
        || source.id
        || ""
    ).trim();

    return mergeRPackageRequirements(
        normalizeRPackageRequirementsAtIngestion(
            runtimeRequirements.rPackages
        ),
        normalizeRPackageRequirementsAtIngestion(
            sourceProperties.rPackageRequirements
        ),
        normalizeRPackageRequirementsAtIngestion(definition.rPackages),
        normalizeRPackageRequirementsAtIngestion(
            requirementsByDialogId[dialogId]
        ),
        createRPackageRequirementsFromNames(sourceProperties.dependencies),
        createRPackageRequirementsFromNames(definition.dependencies)
    );
};


export const createRDialogCommandPackageRequirements = function(
    dependencies: unknown,
    requirements: unknown
): RPackageRequirement[] {
    return mergeRPackageRequirements(
        createRPackageRequirementsFromNames(dependencies),
        requirements
    );
};


export const createRRuntimePackageStatusCommand = function(
    packages: string[]
): string {
    const normalized = parseRPackageList(packages);

    if (!normalized.length) {
        return "";
    }

    return `local({
            .pkgs <- ${createRCharacterVector(normalized)}
            .installed <- vapply(.pkgs, function(.pkg) {
                length(find.package(.pkg, quiet = TRUE)) > 0L
            }, logical(1))
            .missing <- .pkgs[!.installed]
            .attached <- .pkgs[vapply(.pkgs, function(.pkg) is.element(paste0("package:", .pkg), search()), logical(1))]
            cat(paste(paste(.missing, collapse = ","), paste(.attached, collapse = ","), sep = "|"))
        })`;
};


export const createRLibraryLoadCommand = function(packageName: unknown): string {
    const [normalized] = parseRPackageList([packageName]);

    return normalized ? `library(${normalized})` : "";
};


export const createRRuntimeLoadedPackageCommand = function(packages: string[]): string {
    const normalized = parseRPackageList(packages);
    if (!normalized.length) {
        return "";
    }
    return `base::local({
        .pkgs <- base::${createRCharacterVector(normalized)}
        .loaded_namespaces <- base::loadedNamespaces()
        .search <- base::search()
        .loaded <- .pkgs[base::vapply(.pkgs, function(.pkg) {
            base::is.element(base::paste0("package:", .pkg), .search) ||
                base::is.element(.pkg, .loaded_namespaces)
        }, base::logical(1))]
        base::cat(base::paste(.loaded, collapse = ","))
    })`;
};


export const parseRRuntimePackageStatus = function(
    value: unknown,
    requestedPackages?: readonly string[]
): RuntimePackageStatus {
    if (typeof value !== "string") {
        throw new Error("Invalid R package status response.");
    }

    const parts = value.trim().split("|");

    if (parts.length !== 2) {
        throw new Error("Invalid R package status response.");
    }

    const names = parts.map((part) => {
        if (!part) {
            return [];
        }

        const entries = part.split(",");

        if (
            entries.some((name) => !/^[A-Za-z][A-Za-z0-9.]*$/.test(name))
            || new Set(entries).size !== entries.length
            || (
                requestedPackages
                && entries.some((name) => !requestedPackages.includes(name))
            )
        ) {
            throw new Error("Invalid R package status response.");
        }

        return entries;
    });

    return {
        missing: names[0],
        attached: names[1]
    };
};

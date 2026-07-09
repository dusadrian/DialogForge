import {
    parseRPackageList
} from "../commands/rCommandIntents";


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


const parsePart = function(value: unknown): string[] {
    return String(value || "").split(",").map((entry) => {
        return entry.trim();
    }).filter(Boolean);
};


const createRCharacterVector = function(values: string[]): string {
    return `c(${values.map((value) => {
        return JSON.stringify(value);
    }).join(", ")})`;
};


export const readRDialogPackageRequirements = function(
    dialogPayload: unknown,
    requirementsByDialogId: Record<string, unknown> = {}
): string[] {
    const definition = readNestedRecord(dialogPayload, "definition");
    const source = readNestedRecord(dialogPayload, "source");
    const sourceProperties = readNestedRecord(source, "properties");
    const runtimeRequirements = readNestedRecord(dialogPayload, "runtimeRequirements");
    const dialogId = String(
        definition.id
        || source.id
        || ""
    ).trim();

    return parseRPackageList(
        runtimeRequirements.rPackages
        || sourceProperties.dependencies
        || definition.dependencies
        || requirementsByDialogId[dialogId]
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
            .installed <- rownames(installed.packages())
            .missing <- .pkgs[!is.element(.pkgs, .installed)]
            .attached <- .pkgs[vapply(.pkgs, function(.pkg) is.element(paste0("package:", .pkg), search()), logical(1))]
            cat(paste(paste(.missing, collapse = ","), paste(.attached, collapse = ","), sep = "|"))
        })`;
};


export const createRLibraryLoadCommand = function(packageName: unknown): string {
    const [normalized] = parseRPackageList([packageName]);

    return normalized ? `library(${normalized})` : "";
};


export const parseRRuntimePackageStatus = function(
    value: unknown
): RuntimePackageStatus {
    const [missingPart = "", attachedPart = ""] = String(value || "").split("|");

    return {
        missing: parsePart(missingPart),
        attached: parsePart(attachedPart)
    };
};

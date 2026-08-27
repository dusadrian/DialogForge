import type {
    RPackageRequirement
} from "../../../../core/contracts/applicationComposition";


export interface InstalledRPackageManifest {
    schemaVersion: 1;
    packages: Record<string, {
        version: string;
    }>;
}


export type RPackageCompatibilityStatus =
    | "satisfied"
    | "missing"
    | "too-old";


export interface RPackageCompatibilityItem {
    packageName: string;
    requiredVersion?: string;
    requiredVersionExclusive?: boolean;
    installedVersion?: string;
    status: RPackageCompatibilityStatus;
}


export interface RPackageCompatibilityResult {
    compatible: boolean;
    packages: RPackageCompatibilityItem[];
}


const packageNamePattern = /^[A-Za-z][A-Za-z0-9.]*$/;
const rVersionPattern = /^[0-9]+(?:[.-][0-9]+)*$/;
const missingVersionMarker = "<missing>";


const asRecord = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
};


const normalizePackageName = function(value: unknown): string {
    const name = String(value ?? "").trim();

    if (!name || !packageNamePattern.test(name)) {
        throw new Error(`Invalid R package name: ${JSON.stringify(value)}`);
    }

    return name;
};


const normalizeRVersion = function(value: unknown): string {
    const version = String(value ?? "").trim();

    if (!version || !rVersionPattern.test(version)) {
        throw new Error(`Invalid R package version: ${JSON.stringify(value)}`);
    }

    return version;
};


const rVersionParts = function(version: unknown): bigint[] {
    return normalizeRVersion(version).split(/[.-]/g).map((part) => {
        return BigInt(part);
    });
};


// R compares numeric package-version components rather than comparing the
// version strings lexically. Dots and hyphens are both component separators.
export const compareRVersions = function(left: unknown, right: unknown): number {
    const leftParts = rVersionParts(left);
    const rightParts = rVersionParts(right);
    const comparisonLength = Math.max(leftParts.length, rightParts.length);

    for (let index = 0; index < comparisonLength; index += 1) {
        const leftPart = leftParts[index] || 0n;
        const rightPart = rightParts[index] || 0n;

        if (leftPart < rightPart) {
            return -1;
        }

        if (leftPart > rightPart) {
            return 1;
        }
    }

    return 0;
};


const normalizeRequirement = function(value: unknown): RPackageRequirement {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("R package requirements must be structured objects.");
    }

    const record = value as Record<string, unknown>;
    const requirement: RPackageRequirement = {
        name: normalizePackageName(record.name)
    };

    if (Object.prototype.hasOwnProperty.call(record, "minimumVersion")) {
        requirement.minimumVersion = normalizeRVersion(
            record.minimumVersion
        );
    }

    if (Object.prototype.hasOwnProperty.call(record, "minimumVersionExclusive")) {
        if (typeof record.minimumVersionExclusive !== "boolean") {
            throw new Error(
                "R package minimumVersionExclusive must be a boolean."
            );
        }

        if (!requirement.minimumVersion) {
            throw new Error(
                "R package minimumVersionExclusive requires minimumVersion."
            );
        }

        if (record.minimumVersionExclusive) {
            requirement.minimumVersionExclusive = true;
        }
    }

    return requirement;
};


export const normalizeRPackageRequirements = function(
    value: unknown
): RPackageRequirement[] {
    if (value === undefined || value === null) {
        return [];
    }

    if (!Array.isArray(value)) {
        throw new Error("R package requirements must be an array.");
    }

    const byName = new Map<string, RPackageRequirement>();

    value.forEach((entry) => {
        const candidate = normalizeRequirement(entry);
        const existing = byName.get(candidate.name);

        if (!existing) {
            byName.set(candidate.name, candidate);
            return;
        }

        if (candidate.minimumVersion) {
            const comparison = existing.minimumVersion
                ? compareRVersions(
                    candidate.minimumVersion,
                    existing.minimumVersion
                )
                : 1;

            if (
                comparison > 0
                || (
                    comparison === 0
                    && candidate.minimumVersionExclusive
                    && !existing.minimumVersionExclusive
                )
            ) {
                existing.minimumVersion = candidate.minimumVersion;

                if (candidate.minimumVersionExclusive) {
                    existing.minimumVersionExclusive = true;
                }
                else {
                    delete existing.minimumVersionExclusive;
                }
            }
        }
    });

    return Array.from(byName.values());
};


export const normalizeRPackageRequirementsAtIngestion = function(
    value: unknown
): RPackageRequirement[] {
    if (value === undefined || value === null) {
        return [];
    }

    if (!Array.isArray(value)) {
        throw new Error("R package requirements must be an array.");
    }

    return normalizeRPackageRequirements(value.map((entry) => {
        return typeof entry === "string" ? { name: entry } : entry;
    }));
};


export const createRPackageRequirementsFromNames = function(
    value: unknown
): RPackageRequirement[] {
    const source = Array.isArray(value)
        ? value
        : String(value || "").split(/[;,\n]/g);

    return normalizeRPackageRequirements(
        source.map((name) => {
            return {
                name: String(name || "").trim()
            };
        }).filter((entry) => {
            return Boolean(entry.name);
        })
    );
};


export const mergeRPackageRequirements = function(
    ...values: unknown[]
): RPackageRequirement[] {
    return normalizeRPackageRequirements(
        values.flatMap((value) => {
            return Array.isArray(value) ? value : [];
        })
    );
};


export const applyRPackageRequirementConstraints = function(
    requirementsInput: unknown,
    constraintsInput: unknown
): RPackageRequirement[] {
    const requirements = normalizeRPackageRequirements(requirementsInput);
    const names = new Set(requirements.map((requirement) => {
        return requirement.name;
    }));
    const constraints = normalizeRPackageRequirements(
        constraintsInput
    ).filter((requirement) => {
        return names.has(requirement.name);
    });

    return mergeRPackageRequirements(requirements, constraints);
};


export const readRPackageRequirementNames = function(
    value: unknown
): string[] {
    return normalizeRPackageRequirements(value).map((entry) => entry.name);
};


export const createInstalledRPackageManifest = function(
    versions: Record<string, unknown>
): InstalledRPackageManifest {
    const packages: InstalledRPackageManifest["packages"] = {};

    Object.keys(versions).sort().forEach((rawName) => {
        const version = String(versions[rawName] ?? "").trim();

        if (!version) {
            return;
        }

        const name = normalizePackageName(rawName);
        packages[name] = {
            version: normalizeRVersion(version)
        };
    });

    return {
        schemaVersion: 1,
        packages
    };
};


export const readInstalledRPackageManifest = function(
    value: unknown
): InstalledRPackageManifest {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    const record = asRecord(parsed);

    if (Number(record.schemaVersion) !== 1) {
        throw new Error("Unsupported R package manifest schema version.");
    }

    const rawPackages = asRecord(record.packages);
    const versions: Record<string, unknown> = {};

    Object.keys(rawPackages).forEach((name) => {
        const version = asRecord(rawPackages[name]).version;

        if (!String(version ?? "").trim()) {
            throw new Error(
                `R package manifest entry has no version: ${name}`
            );
        }

        versions[name] = version;
    });

    return createInstalledRPackageManifest(versions);
};


export const resolveRPackageCompatibility = function(
    requirementsInput: unknown,
    manifestInput: unknown
): RPackageCompatibilityResult {
    const requirements = normalizeRPackageRequirements(requirementsInput);
    const manifest = readInstalledRPackageManifest(manifestInput);
    const packages = requirements.map((requirement): RPackageCompatibilityItem => {
        const installedVersion = manifest.packages[requirement.name]?.version;

        if (!installedVersion) {
            return {
                packageName: requirement.name,
                requiredVersion: requirement.minimumVersion,
                requiredVersionExclusive:
                    requirement.minimumVersionExclusive,
                status: "missing"
            };
        }

        const versionComparison = requirement.minimumVersion
            ? compareRVersions(
                installedVersion,
                requirement.minimumVersion
            )
            : 1;

        if (
            requirement.minimumVersion
            && (
                versionComparison < 0
                || (
                    versionComparison === 0
                    && requirement.minimumVersionExclusive
                )
            )
        ) {
            return {
                packageName: requirement.name,
                requiredVersion: requirement.minimumVersion,
                requiredVersionExclusive:
                    requirement.minimumVersionExclusive,
                installedVersion,
                status: "too-old"
            };
        }

        return {
            packageName: requirement.name,
            requiredVersion: requirement.minimumVersion,
            requiredVersionExclusive: requirement.minimumVersionExclusive,
            installedVersion,
            status: "satisfied"
        };
    });

    return {
        compatible: packages.every((entry) => {
            return entry.status === "satisfied";
        }),
        packages
    };
};


export const createRPackageCompatibilityMessage = function(
    result: RPackageCompatibilityResult
): string {
    const lines = result.packages.filter((entry) => {
        return entry.status !== "satisfied";
    }).map((entry) => {
        const requirement = entry.requiredVersionExclusive
            ? `a version newer than ${entry.requiredVersion}`
            : `${entry.requiredVersion} or newer`;

        if (entry.status === "missing") {
            return entry.requiredVersion
                ? `${entry.packageName}: requires ${requirement}; not installed.`
                : `${entry.packageName}: not installed.`;
        }

        return [
            `${entry.packageName}: requires ${requirement};`,
            `installed ${entry.installedVersion}.`
        ].join(" ");
    });

    lines.push(
        "Reinstall or update the required R packages, restart R, and try again."
    );

    return lines.join("\n");
};


const createRCharacterVector = function(values: string[]): string {
    return `c(${values.map((value) => JSON.stringify(value)).join(", ")})`;
};


export const createRPackageVersionsCommand = function(
    requirementsInput: unknown
): string {
    const names = readRPackageRequirementNames(requirementsInput);

    return `local({
        .pkgs <- ${createRCharacterVector(names)}
        .versions <- vapply(.pkgs, function(.pkg) {
            if (requireNamespace(.pkg, quietly = TRUE)) {
                as.character(utils::packageVersion(.pkg))
            }
            else {
                ${JSON.stringify(missingVersionMarker)}
            }
        }, character(1))
        cat(paste(.pkgs, .versions, sep = "\\t", collapse = "\\n"))
    })`;
};


export const parseRPackageVersions = function(
    value: unknown
): InstalledRPackageManifest {
    const versions: Record<string, string> = {};

    String(value ?? "").split(/\r?\n/g).forEach((line) => {
        const separator = line.indexOf("\t");

        if (separator < 1) {
            return;
        }

        const name = line.slice(0, separator).trim();
        const version = line.slice(separator + 1).trim();

        if (name && version && version !== missingVersionMarker) {
            versions[name] = version;
        }
    });

    return createInstalledRPackageManifest(versions);
};

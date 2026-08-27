import type {
    DialogDefinition,
    ProductDialogRuntimeRequirement,
    RPackageRequirement
} from "../../core/contracts/applicationComposition";
import {
    mergeRPackageRequirements,
    normalizeRPackageRequirementsAtIngestion
} from "../../runtime/providers/r/dependencies/rPackageCompatibility";


export type DialogRuntimeRequirementMap = Record<
    string,
    ProductDialogRuntimeRequirement
>;


export const normalizeDialogRuntimePackages = function(
    value: unknown
): RPackageRequirement[] {
    if (Array.isArray(value)) {
        return normalizeRPackageRequirementsAtIngestion(value);
    }

    const requirements = String(value || "")
        .split(/[;,\n]/g)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry): RPackageRequirement => {
            const match = entry.match(
                /^([A-Za-z][A-Za-z0-9.]*)(?:\s*(>=|>)\s*([0-9]+(?:[.-][0-9]+)*))?$/
            );

            if (!match) {
                throw new Error(
                    `Invalid R package requirement: ${entry}`
                );
            }

            const requirement: RPackageRequirement = {
                name: match[1]
            };

            if (match[3]) {
                requirement.minimumVersion = match[3];

                if (match[2] === ">") {
                    requirement.minimumVersionExclusive = true;
                }
            }

            return requirement;
        });

    return normalizeRPackageRequirementsAtIngestion(requirements);
};


export const normalizeDialogRuntimeRequirementMap = function(
    value: unknown
): DialogRuntimeRequirementMap {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }

    const result: DialogRuntimeRequirementMap = {};

    Object.entries(value as Record<string, unknown>).forEach((entry) => {
        const dialogId = String(entry[0] || "").trim();
        const requirement = entry[1];

        if (!dialogId || !requirement || typeof requirement !== "object") {
            return;
        }

        const packages = (requirement as { rPackages?: unknown }).rPackages;

        result[dialogId] = {
            rPackages: normalizeDialogRuntimePackages(packages)
        };
    });

    return result;
};


export const updateDialogRuntimeRequirements = function(
    current: unknown,
    dialogId: string,
    packages: unknown
): DialogRuntimeRequirementMap {
    return Object.assign(
        {},
        normalizeDialogRuntimeRequirementMap(current),
        {
            [dialogId]: {
                rPackages: normalizeDialogRuntimePackages(packages)
            }
        }
    );
};


export const createDialogRuntimeRequirementsPayload = function(
    dialogs: DialogDefinition[],
    requirements: unknown,
    strings: Record<string, string>
) {
    const configured = normalizeDialogRuntimeRequirementMap(requirements);
    const effective: DialogRuntimeRequirementMap = {};

    dialogs.forEach((dialog) => {
        const rPackages = mergeRPackageRequirements(
            dialog.rPackages || [],
            configured[dialog.id]?.rPackages || []
        );

        if (rPackages.length > 0) {
            effective[dialog.id] = { rPackages };
        }
    });

    return {
        dialogs: dialogs.map((dialog) => {
            return {
                id: dialog.id,
                title: dialog.label || dialog.id
            };
        }),
        requirements: effective,
        strings
    };
};

import type {
    DialogDefinition,
    ProductDialogRuntimeRequirement
} from "../../core/contracts/applicationComposition";


export type DialogRuntimeRequirementMap = Record<
    string,
    ProductDialogRuntimeRequirement
>;


export const normalizeDialogRuntimePackages = function(
    value: unknown
): string[] {
    return Array.from(new Set(
        String(value || "")
            .split(/[;,\n]/g)
            .map((name) => name.trim())
            .filter(Boolean)
    )).sort();
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
            rPackages: Array.isArray(packages)
                ? packages.map((name) => String(name)).filter(Boolean)
                : []
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
    return {
        dialogs: dialogs.map((dialog) => {
            return {
                id: dialog.id,
                title: dialog.label || dialog.id
            };
        }),
        requirements: normalizeDialogRuntimeRequirementMap(requirements),
        strings
    };
};

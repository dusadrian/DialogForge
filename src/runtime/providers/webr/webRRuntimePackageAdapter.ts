import {
    parseRPackageList
} from "../r/commands/rCommandIntents";
import {
    loadRequiredRPackages,
    requireSuccessfulRPackageAttachment,
    type RPackageAttachmentReceipt
} from "../r/dependencies/rPackageAttachment";
import {
    readRDialogPackageRequirements
} from "../r/dependencies/runtimePackageRequirements";
import type {
    RPackageRequirement,
    ProductPackageSourcePolicy
} from "../../../core/contracts/applicationComposition";
import {
    applyRPackageRequirementConstraints
} from "../r/dependencies/rPackageCompatibility";
import {
    createRPackagePreparationController,
    prepareRequiredRPackages
} from "../r/dependencies/rPackageRequirementReadiness";
import {
    createRPackageInstallWorkflow,
    type PackageLibraryChoice,
    type PackageRestartChoice,
    type PackageRuntimeSnapshot
} from "../r/dependencies/packageInstallWorkflow";
import {
    captureRPackageRuntime
} from "../r/dependencies/rPackageRuntimeGuard";
import type { RuntimeSessionManager } from "../../provider-contract/runtimeProvider";
import {
    RuntimeDependencyPreparationError
} from "../../dependencies/runtimeDependencyPreparation";


interface WebRRuntimePackageActivity {
    id: string;
}

export interface WebRRuntimePackageLoadOptions {
    activitiesByPackage?: Map<string, WebRRuntimePackageActivity>;
}

export interface WebRRuntimePackageAdapterBindings {
    getRuntime?(): Pick<RuntimeSessionManager, "getSnapshot"> | null | undefined;
    getPackageSourcePolicy?(): ProductPackageSourcePolicy;
    getProductId(): string;
    chooseInstallLibrary(input: { userLibrary: string; defaultLibrary: string }): Promise<PackageLibraryChoice>;
    confirmInstallRestart(packages: string[]): Promise<PackageRestartChoice>;
    restartForInstall(action: "clean" | "restore"): Promise<PackageRuntimeSnapshot>;
    packageRequirementsByDialogId?: Record<string, unknown>;
    packageRequirements?: unknown;
    createActivity(command: string): WebRRuntimePackageActivity;
    finishActivity(activityId: string, stateName: string): void;
    recordRuntimeMessageStream(message: {
        id: string;
        parent_id: string;
        name: "stdout" | "stderr";
        text: string;
    }): void;
    packagesLoaded(packageNames: readonly string[]): Promise<void>;
    ensureRuntime(): Promise<unknown>;
    evaluateHiddenText(command: string): Promise<string>;
    executeVisibleCommand(
        command: string,
        options?: Record<string, unknown>
    ): Promise<RPackageAttachmentReceipt | null | undefined>;
}

export interface WebRRuntimePackageAdapter {
    readRequirements(dialogPayload: unknown): RPackageRequirement[];
    loadPackages(packages: unknown, options?: WebRRuntimePackageLoadOptions): Promise<void>;
    installSessionPackages(packages: unknown): Promise<void>;
    updateSessionPackages(packages: unknown): Promise<void>;
    ensureRequirements(requirements: unknown): Promise<void>;
    ensureDialogPackages(dialogPayload: unknown): Promise<void>;
}

export const createWebRRuntimePackageAdapter = function(
    bindings: WebRRuntimePackageAdapterBindings
): WebRRuntimePackageAdapter {
    const packagePreparation = createRPackagePreparationController<void>({
        getRuntime: bindings.getRuntime,
        ensureRuntime: bindings.ensureRuntime
    });

    const readRequirements = function(
        dialogPayload: unknown
    ): RPackageRequirement[] {
        return applyRPackageRequirementConstraints(
            readRDialogPackageRequirements(
                dialogPayload,
                bindings.packageRequirementsByDialogId || {}
            ),
            bindings.packageRequirements || []
        );
    };

    const loadPackages = async function(
        packages: unknown,
        options: WebRRuntimePackageLoadOptions = {}
    ): Promise<void> {
        const pending = parseRPackageList(packages);

        if (!pending.length) {
            return;
        }

        const activitiesByPackage = options.activitiesByPackage || new Map();

        try {
            await packagePreparation.ensureRuntimeReady();
        }
        catch (error) {
            for (const activity of activitiesByPackage.values()) {
                bindings.recordRuntimeMessageStream({
                    id: `${activity.id}_startup_error`,
                    parent_id: activity.id,
                    name: "stderr",
                    text: error instanceof Error ? error.message : String(error)
                });
                bindings.finishActivity(activity.id, "error");
            }

            throw error;
        }

        const isCurrent = bindings.getRuntime
            ? captureRPackageRuntime(bindings.getRuntime)
            : undefined;
        await loadRequiredRPackages(pending, {
            isCurrent,
            readStatus: async (command) => bindings.evaluateHiddenText(command),
            missingPackages: function(message) {
                for (const activity of activitiesByPackage.values()) {
                    bindings.recordRuntimeMessageStream({
                        id: `${activity.id}_missing_error`,
                        parent_id: activity.id,
                        name: "stderr",
                        text: message
                    });
                    bindings.finishActivity(activity.id, "error");
                }
            },
            attach: async function(packageName, command) {
                let activity = activitiesByPackage.get(packageName);

                if (!activity) {
                    activity = bindings.createActivity(command);
                    activitiesByPackage.set(packageName, activity);
                }

                const result = await bindings.executeVisibleCommand(
                    command,
                    activity?.id
                        ? { activityId: activity.id }
                        : {}
                );

                requireSuccessfulRPackageAttachment(packageName, result, isCurrent);
            },
            packagesLoaded: bindings.packagesLoaded
        });
    };

    const installWorkflow = createRPackageInstallWorkflow({
        getRuntimeSnapshot: bindings.getRuntime
            ? () => bindings.getRuntime?.()?.getSnapshot() || null : undefined,
        getRuntimeIdentity: bindings.getRuntime,
        getProductId: bindings.getProductId,
        getPackageSourcePolicy: bindings.getPackageSourcePolicy,
        // The worker's binary package loader supplies dependency mounting.
        getInstallDependencies: () => false,
        ensureRuntime: () => packagePreparation.ensureRuntimeReady(),
        executeQuery: async function(command) {
            return { status: "ready", value: await bindings.evaluateHiddenText(command) };
        },
        chooseLibrary: bindings.chooseInstallLibrary,
        confirmRestart: bindings.confirmInstallRestart,
        restartRuntime: bindings.restartForInstall,
        executeVisibleCommand: function(command, source) {
            return bindings.executeVisibleCommand(command, { source });
        }
    });

    const ensureRequirements = async function(
        requirementsInput: unknown
    ): Promise<void> {
        const requirements = applyRPackageRequirementConstraints(
            requirementsInput,
            bindings.packageRequirements || []
        );

        if (!requirements.length) {
            return;
        }

        await packagePreparation.prepare(requirements, async function() {
            const isCurrent = bindings.getRuntime
                ? captureRPackageRuntime(bindings.getRuntime)
                : undefined;
            const readiness = await prepareRequiredRPackages(requirements, {
                isCurrent,
                readVersions: async function(command) {
                    return {
                        ok: true,
                        value: await bindings.evaluateHiddenText(command)
                    };
                },
                loadPackages: async function(packageNames) {
                    await loadPackages(packageNames);
                    return { ok: true, error: "" };
                }
            });

            if (!readiness.ok) {
                const message = readiness.status === "r-package-update-required"
                    ? ["Package update required", readiness.error].join("\n")
                    : readiness.error;

                throw new RuntimeDependencyPreparationError(readiness, message);
            }
        });
    };

    return {
        readRequirements,
        loadPackages,
        installSessionPackages: function(packages): Promise<void> {
            return installWorkflow.installRequired(packages);
        },
        updateSessionPackages: function(packages): Promise<void> {
            return installWorkflow.updateRequired(packages);
        },
        ensureRequirements,
        async ensureDialogPackages(dialogPayload) {
            await ensureRequirements(readRequirements(dialogPayload));
        }
    };
};

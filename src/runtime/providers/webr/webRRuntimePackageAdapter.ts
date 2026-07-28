import {
    parseRPackageList
} from "../r/commands/rCommandIntents";
import {
    createRMissingPackageMessage,
    createRPackageLoadFailureMessage,
    createRLibraryLoadCommand,
    createRRuntimePackageStatusCommand,
    parseRRuntimePackageStatus,
    readRDialogPackageRequirements
} from "../r/dependencies/runtimePackageRequirements";
import {
    createWebRRequiredInstallCommand
} from "../r/dependencies/packageInstallPlan";


interface WebRRuntimePackageActivity {
    id: string;
}

export interface WebRRuntimePackageLoadOptions {
    activitiesByPackage?: Map<string, WebRRuntimePackageActivity>;
    manageRuntimeBusy?: boolean;
}

export interface WebRRuntimePackageAdapterBindings {
    loadedPackages: Set<string>;
    packageRequirementsByDialogId?: Record<string, unknown>;
    createActivity(command: string): WebRRuntimePackageActivity;
    finishActivity(activityId: string, stateName: string): void;
    recordRuntimeMessageStream(message: {
        id: string;
        parent_id: string;
        name: "stdout" | "stderr";
        text: string;
    }): void;
    setRuntimeBusy(busy: boolean): void;
    renderToolbar(): void;
    ensureRuntime(): Promise<unknown>;
    evaluateHiddenText(command: string): Promise<string>;
    executeVisibleCommand(
        command: string,
        options?: Record<string, unknown>
    ): Promise<{ ok?: boolean } | null | undefined>;
}

export interface WebRRuntimePackageAdapter {
    readRequirements(dialogPayload: unknown): string[];
    loadPackages(packages: unknown, options?: WebRRuntimePackageLoadOptions): Promise<void>;
    installSessionPackages(packages: unknown): Promise<void>;
    ensureDialogPackages(dialogPayload: unknown): Promise<void>;
}

const readRuntimePackageStatus = async function(
    bindings: WebRRuntimePackageAdapterBindings,
    packages: string[]
): Promise<ReturnType<typeof parseRRuntimePackageStatus>> {
    const result = await bindings.evaluateHiddenText(
        createRRuntimePackageStatusCommand(packages)
    );

    return parseRRuntimePackageStatus(result);
};

export const createWebRRuntimePackageAdapter = function(
    bindings: WebRRuntimePackageAdapterBindings
): WebRRuntimePackageAdapter {
    const readRequirements = function(dialogPayload: unknown): string[] {
        return readRDialogPackageRequirements(
            dialogPayload,
            bindings.packageRequirementsByDialogId || {}
        );
    };

    const loadPackages = async function(
        packages: unknown,
        options: WebRRuntimePackageLoadOptions = {}
    ): Promise<void> {
        const pending = parseRPackageList(packages).filter((packageName) => {
            return !bindings.loadedPackages.has(packageName);
        });

        if (!pending.length) {
            return;
        }

        const activitiesByPackage = options.activitiesByPackage || new Map();

        for (const packageName of pending) {
            if (!activitiesByPackage.has(packageName)) {
                activitiesByPackage.set(
                    packageName,
                    bindings.createActivity(createRLibraryLoadCommand(packageName))
                );
            }
        }

        const manageRuntimeBusy = options.manageRuntimeBusy !== false;

        if (manageRuntimeBusy) {
            bindings.setRuntimeBusy(true);
            bindings.renderToolbar();
        }

        try {
            await bindings.ensureRuntime();
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

            if (manageRuntimeBusy) {
                bindings.setRuntimeBusy(false);
                bindings.renderToolbar();
            }

            throw error;
        }

        try {
            const status = await readRuntimePackageStatus(bindings, pending);

            if (status.missing.length) {
                const message = createRMissingPackageMessage(status.missing);

                for (const activity of activitiesByPackage.values()) {
                    bindings.recordRuntimeMessageStream({
                        id: `${activity.id}_missing_error`,
                        parent_id: activity.id,
                        name: "stderr",
                        text: message
                    });
                    bindings.finishActivity(activity.id, "error");
                }

                throw new Error(message);
            }

            for (const packageName of pending) {
                const activity = activitiesByPackage.get(packageName);

                if (status.attached.includes(packageName)) {
                    bindings.loadedPackages.add(packageName);
                    if (activity?.id) {
                        bindings.finishActivity(activity.id, "idle");
                    }
                    continue;
                }

                const result = await bindings.executeVisibleCommand(
                    createRLibraryLoadCommand(packageName),
                    activity?.id
                        ? {
                            activityId: activity.id,
                            preRecorded: true,
                            manageRuntimeBusy: false
                        }
                        : {
                            manageRuntimeBusy: false
                        }
                );

                if (!result?.ok) {
                    throw new Error(createRPackageLoadFailureMessage(packageName));
                }

                bindings.loadedPackages.add(packageName);
            }
        }
        finally {
            if (manageRuntimeBusy) {
                bindings.setRuntimeBusy(false);
                bindings.renderToolbar();
            }
        }
    };

    const installSessionPackages = async function(packages: unknown): Promise<void> {
        const packageNames = parseRPackageList(packages);

        if (!packageNames.length) {
            return;
        }

        const result = await bindings.executeVisibleCommand(
            createWebRRequiredInstallCommand(packageNames)
        );

        if (!result?.ok) {
            throw new Error(createRPackageLoadFailureMessage(packageNames.join(", ")));
        }

        packageNames.forEach((packageName) => {
            bindings.loadedPackages.delete(packageName);
        });
    };

    return {
        readRequirements,
        loadPackages,
        installSessionPackages,
        async ensureDialogPackages(dialogPayload) {
            const packages = readRequirements(dialogPayload);

            if (!packages.length) {
                return;
            }

            await loadPackages(packages);
        }
    };
};

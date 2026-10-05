import {
    createRPackageCompatibilityMessage,
    createRPackageVersionsCommand,
    normalizeRPackageRequirements,
    parseRPackageVersions,
    resolveRPackageCompatibility
} from "./rPackageCompatibility";
import {
    captureRPackageRuntime,
    requireCurrentRPackageRuntime,
    retiredRPackageRuntimeMessage
} from "./rPackageRuntimeGuard";
import type { RuntimeSessionManager } from "../../../provider-contract/runtimeProvider";

interface RPackageRuntimeStartupReceipt {
    runtime: Pick<RuntimeSessionManager, "getSnapshot">;
    providerId: string;
    lifecycleGeneration?: number;
}


export const createRPackageRuntimeStartupReceipt = function(
    runtime: Pick<RuntimeSessionManager, "getSnapshot">
): RPackageRuntimeStartupReceipt {
    const snapshot = runtime.getSnapshot();
    if (snapshot.status !== "ready") {
        throw new Error("R runtime is not ready.");
    }
    return {
        runtime, providerId: snapshot.providerId,
        lifecycleGeneration: snapshot.lifecycleGeneration
    };
};


export interface RPackageRequirementReadiness {
    ok: boolean;
    error: string;
    status?: "r-package-update-required";
}


export const createRPackagePreparationController = function<Result>(
    bindings: {
        getRuntime?: Parameters<typeof captureRPackageRuntime>[0];
        ensureRuntime?(): Promise<unknown>;
    } = {}
) {
    const pendingPreparations = new Map<string, Promise<Result>>();
    let pendingStartup: Promise<unknown> | null = null;
    let startupRuntime: ReturnType<Parameters<typeof captureRPackageRuntime>[0]>;
    let preparationRuntime: ReturnType<Parameters<typeof captureRPackageRuntime>[0]>;
    let preparationGeneration: number | undefined;

    const ensureRuntimeReady = async function(): Promise<void> {
        const runtime = bindings.getRuntime?.();

        if (!bindings.ensureRuntime || runtime?.getSnapshot().status === "ready") {
            return;
        }

        let startup = pendingStartup;
        if (!startup || runtime !== startupRuntime) {
            const generation = runtime?.getSnapshot().lifecycleGeneration;
            startup = Promise.resolve().then(function() {
                if (
                    bindings.getRuntime
                    && (bindings.getRuntime() !== runtime
                        || runtime?.getSnapshot().lifecycleGeneration !== generation)
                ) {
                    throw new Error(retiredRPackageRuntimeMessage);
                }
                return bindings.ensureRuntime!();
            });
            pendingStartup = startup;
            startupRuntime = runtime;
        }

        try {
            const started = await startup;

            if (bindings.getRuntime) {
                const current = bindings.getRuntime();
                const receipt = started && typeof started === "object" && "runtime" in started
                    ? started as RPackageRuntimeStartupReceipt : null;
                if (
                    (runtime && current !== runtime)
                    || (!runtime && (!receipt || current !== receipt.runtime))
                    || (receipt && (current !== receipt.runtime
                        || current?.getSnapshot().providerId !== receipt.providerId
                        || current?.getSnapshot().lifecycleGeneration !== receipt.lifecycleGeneration))
                ) {
                    throw new Error(retiredRPackageRuntimeMessage);
                }
                if (current?.getSnapshot().status !== "ready") {
                    throw new Error("R runtime is not ready.");
                }
            }
        }
        finally {
            if (pendingStartup === startup) {
                pendingStartup = null;
                startupRuntime = undefined;
            }
        }
    };

    return {
        ensureRuntimeReady,
        async prepare(
            requirementsInput: unknown,
            preparePackages: () => Promise<Result>
        ): Promise<Result> {
            if (bindings.ensureRuntime) {
                await ensureRuntimeReady();
            }
            const runtime = bindings.getRuntime?.();
            const generation = runtime?.getSnapshot().lifecycleGeneration;
            if (runtime !== preparationRuntime || generation !== preparationGeneration) {
                pendingPreparations.clear();
                preparationRuntime = runtime;
                preparationGeneration = generation;
            }
            const requirements = normalizeRPackageRequirements(requirementsInput);
            const key = requirements.map((requirement) => {
                return [
                    requirement.name,
                    requirement.minimumVersion || "",
                    requirement.minimumVersionExclusive ? ">" : ">="
                ].join("@");
            }).sort().join("\n");
            const pending = pendingPreparations.get(key);

            if (pending) {
                return pending;
            }

            // Register before entering host callbacks, including synchronous ones.
            const isCurrent = bindings.getRuntime
                ? captureRPackageRuntime(bindings.getRuntime) : undefined;
            const preparation = Promise.resolve().then(async function() {
                requireCurrentRPackageRuntime(isCurrent);
                const result = await preparePackages();
                requireCurrentRPackageRuntime(isCurrent);
                return result;
            });
            pendingPreparations.set(key, preparation);

            try {
                return await preparation;
            }
            finally {
                if (pendingPreparations.get(key) === preparation) {
                    pendingPreparations.delete(key);
                }
            }
        }
    };
};


export const readRPackageRequirementReadiness = async function(
    requirementsInput: unknown,
    readVersions: (command: string) => Promise<{
        ok: boolean;
        value?: unknown;
        error?: string;
    }>
): Promise<RPackageRequirementReadiness> {
    const requirements = normalizeRPackageRequirements(requirementsInput);

    if (!requirements.length) {
        return { ok: true, error: "" };
    }

    // Read the current library, not a remembered successful requirement set.
    // Packages may have been changed by R code outside the package menu.
    const versions = await readVersions(
        createRPackageVersionsCommand(requirements)
    );

    if (!versions.ok) {
        return {
            ok: false,
            error: versions.error || "Failed to inspect required R package versions."
        };
    }

    const compatibility = resolveRPackageCompatibility(
        requirements,
        parseRPackageVersions(versions.value)
    );

    if (!compatibility.compatible) {
        return {
            ok: false,
            error: createRPackageCompatibilityMessage(compatibility),
            status: "r-package-update-required"
        };
    }

    return { ok: true, error: "" };
};


export const prepareRequiredRPackages = async function(
    requirementsInput: unknown,
    bindings: {
        isCurrent?(): boolean;
        readVersions: Parameters<typeof readRPackageRequirementReadiness>[1];
        loadPackages(packageNames: string[]): Promise<RPackageRequirementReadiness>;
    }
): Promise<RPackageRequirementReadiness> {
    const requirements = normalizeRPackageRequirements(requirementsInput);

    if (!requirements.length) {
        return { ok: true, error: "" };
    }

    if (bindings.isCurrent && !bindings.isCurrent()) {
        return { ok: false, error: retiredRPackageRuntimeMessage };
    }
    const readiness = await readRPackageRequirementReadiness(
        requirements,
        bindings.readVersions
    );

    if (bindings.isCurrent && !bindings.isCurrent()) {
        return { ok: false, error: retiredRPackageRuntimeMessage };
    }
    if (!readiness.ok) {
        return readiness;
    }

    const result = await bindings.loadPackages(requirements.map((requirement) => requirement.name));
    return bindings.isCurrent && !bindings.isCurrent()
        ? { ok: false, error: retiredRPackageRuntimeMessage }
        : result;
};

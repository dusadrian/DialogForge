import type {
    ProductPackageSourcePolicy
} from "../../../../core/contracts/applicationComposition";
import {
    createRequiredInstallCommand,
    createRUniverseInstallCommand,
    normalizeRInstallationPackageNames as normalizePackageNames,
    selectRDevelopmentPackages
} from "./packageInstallPlan";
import {
    captureRPackageRuntimeSnapshot,
    requireCurrentRPackageRuntime,
    type RPackageRuntimeSnapshot
} from "./rPackageRuntimeGuard";
import {
    createRRuntimeLoadedPackageCommand, parseRRuntimePackageStatus
} from "./runtimePackageRequirements";
import {
    requireSuccessfulRuntimeCommand,
    type RuntimeCommandResult
} from "../../../commands/runtimeCommandReceipt";
import { readRPackageRequirementReadiness } from "./rPackageRequirementReadiness";

export { selectRDevelopmentPackages } from "./packageInstallPlan";


export interface PackageLibraryChoice {
    action: "user" | "default" | "cancel";
}


export interface PackageRestartChoice {
    action: "clean" | "restore" | "cancel";
}


export interface PackageRuntimeSnapshot {
    status: string;
    providerId?: string;
    lifecycleGeneration?: number;
}


export interface PackageQueryResult {
    status: string;
    value?: unknown;
    message?: string;
}


export interface RPackageInstallWorkflowBindings {
    getRuntimeSnapshot?(): RPackageRuntimeSnapshot | null;
    getRuntimeIdentity?(): unknown;
    getProductId(): string;
    getPackageSourcePolicy?(): ProductPackageSourcePolicy;
    getInstallDependencies?(): boolean;
    ensureRuntime?(): Promise<unknown>;
    packagesInstalled?(packages: string[]): void;
    executeQuery(query: string, source: string): Promise<PackageQueryResult>;
    chooseLibrary(input: {
        userLibrary: string;
        defaultLibrary: string;
    }): Promise<PackageLibraryChoice>;
    confirmRestart(packages: string[]): Promise<PackageRestartChoice>;
    restartRuntime(
        action: "clean" | "restore"
    ): Promise<PackageRuntimeSnapshot>;
    executeVisibleCommand(command: string, source: string): Promise<RuntimeCommandResult>;
}


export interface RPackageInstallWorkflow {
    installRequired(value: unknown): Promise<void>;
    updateRequired(value: unknown): Promise<void>;
}


export const createRPackageInstallWorkflow = function(
    bindings: RPackageInstallWorkflowBindings
): RPackageInstallWorkflow {
    const productId = function(): string {
        return bindings.getProductId();
    };
    const packageSourcePolicy = function(): ProductPackageSourcePolicy {
        return bindings.getPackageSourcePolicy?.() || {};
    };
    const captureInstallationRuntime = function(
        expected?: RPackageRuntimeSnapshot
    ): (() => boolean) | undefined {
        if (!bindings.getRuntimeSnapshot) {
            return undefined;
        }
        const owner = bindings.getRuntimeIdentity?.();
        const isCurrent = captureRPackageRuntimeSnapshot(
            bindings.getRuntimeSnapshot,
            expected || bindings.getRuntimeSnapshot()
        );
        return function(): boolean {
            return isCurrent() && (
                !bindings.getRuntimeIdentity || bindings.getRuntimeIdentity() === owner
            );
        };
    };

    const query = async function(code: string, isCurrent?: () => boolean): Promise<string> {
        requireCurrentRPackageRuntime(isCurrent);
        const result = await bindings.executeQuery(
            code,
            `${productId()}.packages`
        );
        requireCurrentRPackageRuntime(isCurrent);

        if (result.status !== "ready") {
            throw new Error(
                result.message || "R package query failed."
            );
        }

        return String(result.value || "");
    };

    const getLoadedPackages = async function(
        packages: string[],
        isCurrent?: () => boolean
    ): Promise<string[]> {
        const normalized = normalizePackageNames(packages);

        if (normalized.length === 0) {
            return [];
        }

        const value = await query(createRRuntimeLoadedPackageCommand(normalized), isCurrent);
        // Reuse strict package-name validation, without changing attachment status
        // used by ordinary library loading. A namespace alone requires restart.
        return parseRRuntimePackageStatus(`|${value}`, normalized).attached;
    };

    const verifyInstalledPackages = async function(
        packages: string[],
        isCurrent?: () => boolean
    ): Promise<void> {
        const readiness = await readRPackageRequirementReadiness(
            packages.map((name) => ({ name })),
            async function(command) {
                return { ok: true, value: await query(command, isCurrent) };
            }
        );
        requireCurrentRPackageRuntime(isCurrent);
        if (!readiness.ok) {
            throw new Error(
                `Package installation did not produce ready packages.\n${readiness.error}`
            );
        }
    };

    const chooseLibrary = async function(isCurrent?: () => boolean): Promise<string | null> {
        const value = await query(`
            local({
                normalize <- function(path) {
                    path <- path.expand(as.character(if (length(path)) path[[1]] else ""))

                    if (!nzchar(path)) {
                        return("")
                    }

                    normalizePath(path, winslash = "/", mustWork = FALSE)
                }
                libraries <- tryCatch(.libPaths(), error = function(error) character(0))
                user <- tryCatch(path.expand(Sys.getenv("R_LIBS_USER", unset = "")), error = function(error) "")
                default <- if (length(libraries)) as.character(libraries[[1]]) else ""
                user_normalized <- normalize(user)
                library_paths <- vapply(libraries, normalize, character(1))
                needs_choice <- nzchar(user_normalized) && !is.element(user_normalized, library_paths)
                paste(if (needs_choice) "1" else "0", user, default, sep = "\\t")
            })
        `, isCurrent);
        const [needsChoice, userLibrary, defaultLibrary] = value.split("\t");

        if (needsChoice !== "1") {
            return "";
        }

        const result = await bindings.chooseLibrary({
            userLibrary,
            defaultLibrary
        });
        requireCurrentRPackageRuntime(isCurrent);

        if (result.action === "user") {
            return userLibrary || null;
        }

        if (result.action === "default") {
            return defaultLibrary || null;
        }

        return null;
    };

    const prepareRuntime = async function(
        packages: string[]
    ): Promise<{ isCurrent?: () => boolean } | null> {
        await bindings.ensureRuntime?.();
        let isCurrent = captureInstallationRuntime();
        const loadedPackages = await getLoadedPackages(packages, isCurrent);

        if (loadedPackages.length === 0) {
            return { isCurrent };
        }

        const restart = await bindings.confirmRestart(loadedPackages);
        requireCurrentRPackageRuntime(isCurrent);

        if (restart.action === "cancel") {
            return null;
        }

        const snapshot = await bindings.restartRuntime(restart.action);
        if (snapshot.status !== "ready") {
            return null;
        }
        isCurrent = captureInstallationRuntime(snapshot);
        requireCurrentRPackageRuntime(isCurrent);
        return { isCurrent };
    };

    const installRequired = async function(value: unknown): Promise<void> {
        const packages = normalizePackageNames(value);
        if (!packages.length) {
            return;
        }

        const preparation = await prepareRuntime(packages);
        if (!preparation) {
            return;
        }

        const libraryPath = await chooseLibrary(preparation.isCurrent);

        if (libraryPath === null) {
            return;
        }

        const command = createRequiredInstallCommand(
            packages,
            { libraryPath, dependencies: bindings.getInstallDependencies?.() ?? true }
        );

        if (command) {
            requireCurrentRPackageRuntime(preparation.isCurrent);
            const result = await bindings.executeVisibleCommand(
                command,
                `${productId()}.packages.installRequired`
            );
            requireCurrentRPackageRuntime(preparation.isCurrent);
            requireSuccessfulRuntimeCommand(result, "Failed to install required R packages.");
            await verifyInstalledPackages(packages, preparation.isCurrent);
            bindings.packagesInstalled?.(packages);
        }
    };

    const updateRequired = async function(value: unknown): Promise<void> {
        const packages = selectRDevelopmentPackages(value, packageSourcePolicy());
        if (!packages.length) {
            return;
        }

        const preparation = await prepareRuntime(packages);
        if (!preparation) {
            return;
        }

        const libraryPath = await chooseLibrary(preparation.isCurrent);

        if (libraryPath === null) {
            return;
        }

        const command = createRUniverseInstallCommand(
            packages,
            { libraryPath }
        );

        if (command) {
            requireCurrentRPackageRuntime(preparation.isCurrent);
            const result = await bindings.executeVisibleCommand(
                command,
                `${productId()}.packages.updateRequired`
            );
            requireCurrentRPackageRuntime(preparation.isCurrent);
            requireSuccessfulRuntimeCommand(result, "Failed to update required R packages.");
            await verifyInstalledPackages(packages, preparation.isCurrent);
            bindings.packagesInstalled?.(packages);
        }
    };

    return {
        installRequired,
        updateRequired
    };
};

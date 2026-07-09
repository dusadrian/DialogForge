import type {
    ProductPackageSourcePolicy
} from "../../../../core/contracts/applicationComposition";


export interface PackageLibraryChoice {
    action: "user" | "default" | "cancel";
}


export interface PackageRestartChoice {
    action: "clean" | "restore" | "cancel";
}


export interface PackageRuntimeSnapshot {
    status: string;
}


export interface PackageQueryResult {
    status: string;
    value?: unknown;
    message?: string;
}


export interface RPackageInstallWorkflowBindings {
    getProductId(): string;
    getPackageSourcePolicy?(): ProductPackageSourcePolicy;
    executeQuery(query: string, source: string): Promise<PackageQueryResult>;
    chooseLibrary(input: {
        userLibrary: string;
        defaultLibrary: string;
    }): Promise<PackageLibraryChoice>;
    confirmRestart(packages: string[]): Promise<PackageRestartChoice>;
    restartRuntime(
        action: "clean" | "restore"
    ): Promise<PackageRuntimeSnapshot>;
    executeVisibleCommand(command: string, source: string): Promise<void>;
}


export interface RPackageInstallWorkflow {
    installRequired(value: unknown): Promise<void>;
    updateRequired(value: unknown): Promise<void>;
}


interface RequiredPackageSourcePlan {
    cran: Set<string>;
    runiverse: Set<string>;
    both: Set<string>;
}


const CRAN_PACKAGE_REPOSITORY = "https://cloud.r-project.org";
const RUNIVERSE_PACKAGE_REPOSITORY = "https://dusadrian.r-universe.dev";
const KNOWN_DEVELOPMENT_PACKAGES = new Set([
    "admisc",
    "declared",
    "DDIwR",
    "QCA",
    "statistics",
    "venn"
]);
const DEVELOPMENT_PACKAGE_REPOSITORY = JSON.stringify(
    RUNIVERSE_PACKAGE_REPOSITORY
);


const normalizePackageNames = function(value: unknown): string[] {
    const names = Array.isArray(value)
        ? value
        : String(value || "").split(/[;,\n]/g);

    return Array.from(new Set(names.map((name) => {
        return String(name || "").trim();
    }).filter(Boolean))).sort((left, right) => {
        return left.localeCompare(right);
    });
};


const createRCharacterVector = function(values: string[]): string {
    return `c(${values.map((value) => {
        return JSON.stringify(value);
    }).join(", ")})`;
};


const REQUIRED_PACKAGE_REPOSITORIES = createRCharacterVector([
    RUNIVERSE_PACKAGE_REPOSITORY,
    CRAN_PACKAGE_REPOSITORY
]);


const requiredPackageSourcePlan = function(
    policy: ProductPackageSourcePolicy
): RequiredPackageSourcePlan {
    const plan: RequiredPackageSourcePlan = {
        cran: new Set(normalizePackageNames(policy.cran || [])),
        runiverse: new Set(
            normalizePackageNames(policy.runiverse || [])
        ),
        both: new Set(normalizePackageNames(policy.both || []))
    };

    return plan;
};


const hasPackageSourcePlan = function(plan: RequiredPackageSourcePlan): boolean {
    return plan.cran.size > 0
        || plan.runiverse.size > 0
        || plan.both.size > 0;
};


const isDevelopmentPackage = function(
    name: string,
    plan: RequiredPackageSourcePlan
): boolean {
    if (hasPackageSourcePlan(plan)) {
        return plan.runiverse.has(name)
            || plan.both.has(name);
    }

    return KNOWN_DEVELOPMENT_PACKAGES.has(name);
};


const createPackageInstallCommand = function(
    packages: string[],
    repository: string,
    libraryPath = "",
    dependencies = false
): string {
    const normalized = normalizePackageNames(packages);

    if (normalized.length === 0) {
        return "";
    }

    const argumentsList = [
        createRCharacterVector(normalized)
    ];

    if (libraryPath) {
        argumentsList.push(`lib = ${JSON.stringify(libraryPath)}`);
    }

    if (dependencies) {
        argumentsList.push("dependencies = TRUE");
    }

    argumentsList.push(`repos = ${repository}`);

    const setup = libraryPath
        ? [
            `dir.create(${JSON.stringify(libraryPath)}, recursive = TRUE, showWarnings = FALSE)`,
            `.libPaths(unique(c(${JSON.stringify(libraryPath)}, .libPaths())))`
        ]
        : [];

    return setup.concat([
        "install.packages(",
        `    ${argumentsList.join(",\n    ")}`,
        ")"
    ]).join("\n");
};


export const createRPackageInstallWorkflow = function(
    bindings: RPackageInstallWorkflowBindings
): RPackageInstallWorkflow {
    const productId = function(): string {
        return bindings.getProductId();
    };
    const packageSourcePolicy = function(): ProductPackageSourcePolicy {
        return bindings.getPackageSourcePolicy?.() || {};
    };

    const query = async function(code: string): Promise<string> {
        const result = await bindings.executeQuery(
            code,
            `${productId()}.packages`
        );

        if (result.status !== "ready") {
            throw new Error(
                result.message || "R package query failed."
            );
        }

        return String(result.value || "");
    };

    const getLoadedPackages = async function(
        packages: string[]
    ): Promise<string[]> {
        const normalized = normalizePackageNames(packages);

        if (normalized.length === 0) {
            return [];
        }

        const value = await query(`
            local({
                packages <- ${createRCharacterVector(normalized)}
                loaded <- packages[
                    is.element(paste0("package:", packages), search())
                ]
                paste(loaded, collapse = ",")
            })
        `);

        return normalizePackageNames(value);
    };

    const chooseLibrary = async function(): Promise<string | null> {
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
        `);
        const [needsChoice, userLibrary, defaultLibrary] = value.split("\t");

        if (needsChoice !== "1") {
            return "";
        }

        const result = await bindings.chooseLibrary({
            userLibrary,
            defaultLibrary
        });

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
    ): Promise<boolean> {
        const loadedPackages = await getLoadedPackages(packages);

        if (loadedPackages.length === 0) {
            return true;
        }

        const restart = await bindings.confirmRestart(loadedPackages);

        if (restart.action === "cancel") {
            return false;
        }

        const snapshot = await bindings.restartRuntime(restart.action);

        return snapshot.status === "ready";
    };

    const installRequired = async function(value: unknown): Promise<void> {
        const packages = normalizePackageNames(value);

        if (!await prepareRuntime(packages)) {
            return;
        }

        const libraryPath = await chooseLibrary();

        if (libraryPath === null) {
            return;
        }

        const command = createPackageInstallCommand(
            packages,
            REQUIRED_PACKAGE_REPOSITORIES,
            libraryPath,
            true
        );

        if (command) {
            await bindings.executeVisibleCommand(
                command,
                `${productId()}.packages.installRequired`
            );
        }
    };

    const updateRequired = async function(value: unknown): Promise<void> {
        const sourcePlan = requiredPackageSourcePlan(
            packageSourcePolicy()
        );
        const packages = normalizePackageNames(value).filter((name) => {
            return isDevelopmentPackage(name, sourcePlan);
        });

        if (!await prepareRuntime(packages)) {
            return;
        }

        const libraryPath = await chooseLibrary();

        if (libraryPath === null) {
            return;
        }

        const command = createPackageInstallCommand(
            packages,
            DEVELOPMENT_PACKAGE_REPOSITORY,
            libraryPath
        );

        if (command) {
            await bindings.executeVisibleCommand(
                command,
                `${productId()}.packages.updateRequired`
            );
        }
    };

    return {
        installRequired,
        updateRequired
    };
};

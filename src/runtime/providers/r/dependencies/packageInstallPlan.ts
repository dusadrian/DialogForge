import type {
    ProductPackageSourcePolicy
} from "../../../../core/contracts/applicationComposition";


const CRAN_PACKAGE_REPOSITORY = "https://cloud.r-project.org";
const RUNIVERSE_PACKAGE_REPOSITORY = "https://dusadrian.r-universe.dev";

const rUniversePackages = new Set([
    "admisc",
    "declared",
    "DDIwR",
    "statistics"
]);

const knownDevelopmentPackages = new Set([
    "admisc", "declared", "DDIwR", "QCA", "statistics", "venn"
]);


export const normalizeRInstallationPackageNames = function(value: unknown): string[] {
    const names = Array.isArray(value)
        ? value : String(value || "").split(/[;,\n]/g);
    return Array.from(new Set(names.map((name) => {
        return String(name || "").trim();
    }).filter(Boolean))).sort((left, right) => left.localeCompare(right));
};


export const selectRDevelopmentPackages = function(
    value: unknown,
    policy: ProductPackageSourcePolicy = {}
): string[] {
    const cran = new Set(normalizeRInstallationPackageNames(policy.cran || []));
    const runiverse = new Set(normalizeRInstallationPackageNames(policy.runiverse || []));
    const both = new Set(normalizeRInstallationPackageNames(policy.both || []));
    const hasSourcePolicy = cran.size > 0 || runiverse.size > 0 || both.size > 0;

    return normalizeRInstallationPackageNames(value).filter((name) => {
        return hasSourcePolicy
            ? runiverse.has(name) || both.has(name)
            : knownDevelopmentPackages.has(name);
    });
};


export const normalizePackageNames = function(packages: string[]): string[] {
    return Array.from(new Set(packages.map((name) => {
        return String(name || "").trim();
    }).filter((name) => {
        return name.length > 0;
    })));
};


export const selectRUniversePackages = function(
    packageNames: string[]
): string[] {
    return normalizePackageNames(packageNames).filter((packageName) => {
        return rUniversePackages.has(packageName);
    });
};


const formatPackageVector = function(packageNames: string[]): string {
    return "c(" + packageNames.map((packageName) => {
        return JSON.stringify(packageName);
    }).join(", ") + ")";
};


const requiredRepositoryExpression = function(): string {
    return formatPackageVector([
        RUNIVERSE_PACKAGE_REPOSITORY,
        CRAN_PACKAGE_REPOSITORY
    ]);
};


const createInstallPackagesCommand = function(
    packageNames: string[],
    repositoryExpression: string,
    options: { libraryPath?: string; dependencies?: boolean } = {}
): string {
    const normalized = normalizePackageNames(packageNames);

    if (normalized.length === 0) {
        return "";
    }

    const args = [".install_packages", "lib = .stage"];
    const libraryPath = String(options.libraryPath || "");
    // Dependency selection belongs to the common plan, not either installer.
    args.push("dependencies = FALSE");
    args.push("repos = " + repositoryExpression);

    // Both hosts execute this selection/verification policy. The worker supplies
    // only binary repository addressing and archive extraction operations.
    const setup = libraryPath ? [
        `dir.create(${JSON.stringify(libraryPath)}, recursive = TRUE, showWarnings = FALSE)`
    ] : [];
    return setup.concat([
        "local({",
        `    .packages <- ${formatPackageVector(normalized)}`,
        "    .loaded <- intersect(.packages, base::loadedNamespaces())",
        "    if (length(.loaded)) {",
        '        stop(paste("Restart R before installing loaded packages:", paste(.loaded, collapse = ", ")))',
        "    }",
        `    .library <- ${libraryPath ? JSON.stringify(libraryPath) : ".libPaths()[[1L]]"}`,
        "    if (!dir.exists(.library) || file.access(.library, 2L) != 0L) {",
        "        stop(\"Selected R package library is not a writable directory.\")",
        "    }",
        // WORKERFS may report directory permission bits without accepting writes.
        // Both hosts prove the selected library can create/release one owned file
        // before changing library search or beginning repository/installer work.
        '    .write_probe <- base::tempfile(".dialogforge-library-write-", tmpdir = .library)',
        "    .writable <- base::suppressWarnings(base::tryCatch(",
        "        base::file.create(.write_probe),",
        "        error = function(condition) FALSE",
        "    ))",
        "    if (!base::isTRUE(.writable)) {",
        '        stop("Selected R package library is not a writable directory.")',
        "    }",
        "    if (base::unlink(.write_probe) != 0L) {",
        '        stop("Unable to remove the package library write probe.")',
        "    }",
        "    .libPaths(unique(c(.library, .libPaths())))",
        `    .repositories <- ${repositoryExpression}`,
        '    .transport <- getOption("dialogforge.r.package.transport")',
        "    .contrib <- if (is.null(.transport)) {",
        "        utils::contrib.url(.repositories)",
        "    } else {",
        "        .transport$contrib(.repositories)",
        "    }",
        "    .available <- utils::available.packages(contriburl = .contrib, ignore_repo_cache = TRUE)",
        "    .missing <- setdiff(.packages, rownames(.available))",
        "    if (length(.missing)) {",
        '        stop(paste("Requested R packages unavailable:", paste(.missing, collapse = ", ")))',
        "    }",
        // R's own installer selector retains compatible installed dependencies
        // and includes missing/outdated mandatory dependencies in install order.
        "    .select_dependencies <- utils::getFromNamespace(\"getDependencies\", \"utils\")",
        "    .install_packages <- .select_dependencies(",
        "        .packages, dependencies = " + (options.dependencies ? "TRUE" : "NA") + ",",
        "        available = .available, lib = .library",
        "    )",
        "    .loaded <- intersect(.install_packages, base::loadedNamespaces())",
        "    if (length(.loaded)) {",
        '        stop(paste("Restart R before installing loaded packages:", paste(.loaded, collapse = ", ")))',
        "    }",
        // Extraction is a host mechanic; keeping partial packages out of the
        // selected library and restoring failed replacements is common policy.
        "    if (any(!grepl(\"^[[:alpha:]][[:alnum:].]*$\", .install_packages))) {",
        '        stop("Repository selected an invalid R package name.")',
        "    }",
        '    .stage <- base::tempfile(".dialogforge-package-stage-", tmpdir = .library)',
        "    if (!dir.create(.stage)) {",
        '        stop("Unable to create the package installation staging directory.")',
        "    }",
        '    .backup <- file.path(.stage, ".previous")',
        "    .library_paths <- .libPaths()",
        "    .promoted <- character(0)",
        "    .backed_up <- character(0)",
        "    .committed <- FALSE",
        "    on.exit({",
        "        .libPaths(.library_paths)",
        "        .release_stage <- TRUE",
        "        if (!.committed) {",
        "            for (.package in rev(.promoted)) {",
        "                if (base::unlink(file.path(.library, .package), recursive = TRUE) != 0L) {",
        "                    .release_stage <- FALSE",
        "                }",
        "            }",
        "            for (.package in rev(.backed_up)) {",
        "                if (!base::file.rename(file.path(.backup, .package), file.path(.library, .package))) {",
        "                    .release_stage <- FALSE",
        "                }",
        "            }",
        "        }",
        "        if (!.release_stage) {",
        '            stop(paste("Package rollback needs recovery from:", .stage))',
        "        }",
        "        if (base::unlink(.stage, recursive = TRUE) != 0L) {",
        '            stop(paste("Unable to remove package installation staging directory:", .stage))',
        "        }",
        "    }, add = TRUE)",
        "    .libPaths(unique(c(.stage, .library_paths)))",
        "    if (is.null(.transport)) {",
        "        install.packages(",
        args.map((arg) => {
            return "            " + arg;
        }).join(",\n"),
        "        )",
        "    } else {",
        "        .transport$install(.install_packages, .stage, .available)",
        "    }",
        "    for (.package in .install_packages) {",
        "        .path <- find.package(.package, lib.loc = .stage, quiet = TRUE)",
        "        if (!length(.path)) {",
        '            stop(paste("Package installation did not reach the selected library:", .package))',
        "        }",
        "        .version <- utils::packageVersion(.package, lib.loc = .stage)",
        '        .expected <- .available[.package, "Version"]',
        "        if (.version != package_version(.expected)) {",
        '            stop(paste("Package installation did not produce repository version:", .package, .expected))',
        "        }",
        "    }",
        "    if (!dir.create(.backup)) {",
        '        stop("Unable to create the package replacement backup directory.")',
        "    }",
        "    for (.package in .install_packages) {",
        "        .destination <- file.path(.library, .package)",
        "        if (file.exists(.destination)) {",
        "            if (!base::file.rename(.destination, file.path(.backup, .package))) {",
        '                stop(paste("Unable to preserve the current R package:", .package))',
        "            }",
        "            .backed_up <- c(.backed_up, .package)",
        "        }",
        "        if (!base::file.rename(file.path(.stage, .package), .destination)) {",
        '            stop(paste("Unable to publish the installed R package:", .package))',
        "        }",
        "        .promoted <- c(.promoted, .package)",
        "    }",
        "    .committed <- TRUE",
        "})"
    ]).join("\n");
};


export const createRUniverseInstallCommand = function(
    packageNames: string[],
    options: { libraryPath?: string } = {}
): string {
    return createInstallPackagesCommand(
        packageNames,
        JSON.stringify(RUNIVERSE_PACKAGE_REPOSITORY),
        options
    );
};


export const createRequiredInstallCommand = function(
    packageNames: string[],
    options: { libraryPath?: string; dependencies?: boolean } = {}
): string {
    return createInstallPackagesCommand(
        packageNames,
        requiredRepositoryExpression(),
        { ...options, dependencies: options.dependencies !== false }
    );
};

"use strict";

// One actual-runtime scenario through the canonical package owners on both hosts.
// No package installation, global library writes or product UI automation here.
exports.checkActualRuntimePackages = async function(options) {
    const requireResult = function(condition, message) {
        if (!condition) throw Error(options.host + ": " + message);
    };
    const runtime = options.runtime;
    const owners = options.owners;
    const isCurrent = owners.captureRuntime(() => runtime);
    const commands = [];
    const refreshes = [];
    let versionReads = 0;
    let preparations = 0;
    const query = async function(code) {
        const result = await runtime.executeInvisibleQuery({ query: code, source: "paired-package-acceptance" });
        requireResult(result.status === "ready", result.message || "Package query failed");
        return result.value;
    };
    const attach = async function(packageName, code) {
        commands.push(packageName);
        const result = await options.execute(code, "answer");
        owners.requireReceipt(packageName, {
            ok: result.outcome === "success", transcriptEvents: result.returnedEvents
        }, isCurrent);
    };
    const refresh = async function(packages) {
        const snapshot = await runtime.listWorkspaceObjects();
        requireResult(snapshot.status === "ready", "Post-load actual workspace refresh failed");
        refreshes.push([...packages]);
    };
    const load = async function(packageNames) {
        await owners.loadPackages(packageNames, {
            isCurrent, readStatus: query, attach, packagesLoaded: refresh
        });
        return { ok: true, error: "" };
    };
    const readVersions = async function(code) {
        versionReads++;
        return { ok: true, value: await query(code) };
    };
    const requirements = [{ name: "declared", minimumVersion: "0.27" }, { name: "admisc" }];
    const initialAttached = String(await query('paste(search(), collapse="|")')).split("|");
    const reset = await options.execute(
        'for (p in c("declared", "admisc", "splines")) { n <- paste0("package:", p); if (is.element(n, search())) detach(n, character.only=TRUE) }; cat("package-acceptance-ready\\n")', "answer"
    );
    requireResult(reset.outcome === "success", "Private session package reset failed");
    try {
        const actualVersion = String(await query('as.character(utils::packageVersion("declared"))'));
        requireResult(actualVersion === "0.27", "Expected actual required declared0.27 package");
        const incompatible = await owners.preparePackages([
            { name: "declared", minimumVersion: "999.0" }
        ], { isCurrent, readVersions, loadPackages: load });
        requireResult(!incompatible.ok && incompatible.status === "r-package-update-required",
            "Actual incompatible version was accepted");
        const missing = await owners.preparePackages([
            { name: "DialogForgeAbsentPackageFixture" }
        ], { isCurrent, readVersions, loadPackages: load });
        requireResult(!missing.ok && missing.status === "r-package-update-required",
            "Actual absent package was accepted");
        requireResult(commands.length === 0, "Rejected requirements attached packages");
        const preparation = owners.createPreparation({ getRuntime: () => runtime });
        const prepare = async function() {
            preparations++;
            return owners.preparePackages(requirements, { isCurrent, readVersions, loadPackages: load });
        };
        const paired = await Promise.all([
            preparation.prepare(requirements, prepare),
            preparation.prepare([...requirements].reverse(), prepare)
        ]);
        requireResult(paired.every(result => result.ok) && preparations === 1,
            "Equivalent actual preparation did not share one accepted request");
        requireResult(commands.join(",") === "admisc,declared" || commands.join(",") === "declared,admisc",
            "Required packages did not attach exactly once");
        requireResult(refreshes.length === 1 && refreshes[0].length === 2,
            "Required package loads did not produce one shared workspace refresh");
        const readsBeforeRepeat = versionReads;
        const repeated = await preparation.prepare(requirements, prepare);
        requireResult(repeated.ok && preparations === 2 && versionReads === readsBeforeRepeat + 1,
            "Successful preparation was cached instead of reinspecting actual versions");
        requireResult(commands.length === 2 && refreshes.length === 1,
            "Already attached packages repeated visible loads or new-attachment refresh");

        const dataset = await options.execute(
            'package_measurement <- data.frame(value=c(1,2,3,4), numeric_character=c("1","2","3","4")); cat("package-measurement-ready\\n")', "answer"
        );
        requireResult(dataset.outcome === "success", "Measurement fixture failed");
        const metadata = await runtime.readVariableMetadata("package_measurement");
        requireResult(metadata.status === "ready" && metadata.variables.length === 2
            && metadata.variables.every(item => item.measure === "interval"),
        "Actual required declared inference failed after shared attachment");

        let partialError = "";
        try {
            await owners.attachPackages(["splines", "DialogForgeAbsentPackageFixture"], {
                isCurrent,
                isAttached: async packageName => String(await query(
                    'as.character(is.element(' + JSON.stringify("package:" + packageName) + ', search()))'
                )) === "TRUE",
                attach, packagesLoaded: refresh
            });
        }
        catch (error) {
            partialError = String(error.message || error);
        }
        requireResult(partialError.includes("DialogForgeAbsentPackageFixture"),
            "Actual failing second library load was not propagated");
        requireResult(refreshes.length === 2 && refreshes[1].join(",") === "splines",
            "Successful partial load was not reconciled once after the later failure");
        requireResult(String(await query('as.character(is.element("package:splines", search()))')) === "TRUE",
            "Partial successful attachment was lost");
        await owners.attachPackages(["splines"], {
            isCurrent, isAttached: async () => true, attach, packagesLoaded: refresh
        });
        requireResult(commands.length === 4 && refreshes.length === 2,
            "Partial-load recovery retried an accepted attachment");
        let loadedNamespaceRestart;
        if (options.checkLoadedNamespaces) {
            const setup = await options.execute([
                'detach("package:declared", character.only=TRUE)',
                'package_restart_original_user <- Sys.getenv("R_LIBS_USER")',
                'Sys.setenv(R_LIBS_USER=tempfile("dialogforge-package-restart-"))',
                'cat("package-namespace-restart-ready\\n")'
            ].join("; "), "answer");
            requireResult(setup.outcome === "success", "Namespace restart fixture failed");
            const state = String(await query(
                'paste(is.element("package:declared", search()), is.element("declared", loadedNamespaces()), sep="|")'
            ));
            requireResult(state === "FALSE|TRUE", "Actual detached namespace state was not established");
            const confirmations = [];
            let libraryChoices = 0;
            const workflow = owners.createInstall({
                getRuntimeSnapshot: () => runtime.getSnapshot(),
                getRuntimeIdentity: () => runtime,
                getProductId: () => "paired-package-namespace",
                executeQuery: async code => ({ status: "ready", value: await query(code) }),
                confirmRestart: async packages => {
                    confirmations.push([...packages]);
                    return { action: "cancel" };
                },
                chooseLibrary: async () => { libraryChoices++; return { action: "cancel" }; },
                restartRuntime: async () => { throw Error("Canceled namespace choice must not restart"); },
                executeVisibleCommand: async () => { throw Error("Canceled namespace choice must not install"); }
            });
            try {
                await workflow.installRequired(["declared"]);
                loadedNamespaceRestart = { state, confirmations, libraryChoices };
            }
            finally {
                const restored = await options.execute(
                    'Sys.setenv(R_LIBS_USER=package_restart_original_user); rm(package_restart_original_user); cat("package-namespace-restart-cleaned\\n")', "answer"
                );
                requireResult(restored.outcome === "success", "Namespace fixture environment restoration failed");
            }
        }
        let emptyRepository;
        if (options.emptyRepository) {
            const setup = await options.execute([
                'package_install_original_libraries <- .libPaths()',
                'package_install_original_user <- Sys.getenv("R_LIBS_USER")',
                'package_install_directory <- tempfile("dialogforge-package-install-")',
                'dir.create(package_install_directory)',
                'Sys.setenv(R_LIBS_USER=package_install_directory)',
                'cat("package-install-private-library-ready\\n")'
            ].join("; "), "answer");
            requireResult(setup.outcome === "success", "Private installation library creation failed");
            const accepted = [];
            const install = owners.createInstall({
                getRuntimeSnapshot: () => runtime.getSnapshot(),
                getRuntimeIdentity: () => runtime,
                getProductId: () => "paired-package-installation",
                getInstallDependencies: () => false,
                executeQuery: async code => ({ status: "ready", value: await query(code) }),
                chooseLibrary: async () => ({ action: "user" }),
                confirmRestart: async () => { throw Error("Absent fixture must not request restart"); },
                restartRuntime: async () => { throw Error("Absent fixture must not restart"); },
                executeVisibleCommand: async code => {
                    // Redirect only physical repository access, not shared planning,
                    // evaluation/outcome or receipt policy. Native/worker run SAME R.
                    code = code.replaceAll("https://dusadrian.r-universe.dev", options.emptyRepository)
                        .replaceAll("https://cloud.r-project.org", options.emptyRepository);
                    const scoped = 'local({ physical_installer <- install.packages; install.packages <- function(pkgs, lib=NULL, repos, ...) { '
                        + 'physical_installer(pkgs, lib=lib, repos='
                        + JSON.stringify(options.emptyRepository) + ', ...) };\n' + code + '\n})';
                    const result = await options.execute(scoped, "answer");
                    return { ok: result.outcome === "success", transcriptEvents: result.returnedEvents };
                },
                packagesInstalled: packages => accepted.push(...packages)
            });
            let failure = "";
            try {
                await install.installRequired(["DialogForgeAbsentPackageFixture"]);
            }
            catch (error) {
                failure = String(error.message || error);
            }
            const present = String(await query(
                'as.character(length(find.package("DialogForgeAbsentPackageFixture", quiet=TRUE)) > 0L)'
            )) === "TRUE";
            emptyRepository = { present, failure, accepted, rejected: failure.length > 0 };
            const restored = await options.execute([
                '.libPaths(package_install_original_libraries)',
                'Sys.setenv(R_LIBS_USER=package_install_original_user)',
                'rm(package_install_original_libraries, package_install_original_user, package_install_directory)',
                'cat("package-install-library-restored\\n")'
            ].join("; "), "answer");
            requireResult(restored.outcome === "success", "Private library state restoration failed");
        }
        return { host: options.host, actualVersion, incompatibleRejected: true,
            missingRejected: true, preparations, versionReads, commands: [...commands],
            refreshes: refreshes.map(packages => [...packages]),
            measures: metadata.variables.map(item => item.measure), partialFailurePropagated: true,
            emptyRepository, loadedNamespaceRestart,
            renderedPackageWorkflowChecked: false,
            physicalInstallFailureChecked: !!options.emptyRepository,
            physicalInstallSuccessChecked: false };
    }
    finally {
        const cleanup = await options.execute(
            'if (exists("package_measurement", .GlobalEnv, inherits=FALSE)) rm(package_measurement); for (p in c("declared", "admisc", "splines")) { n <- paste0("package:", p); if (is.element(n, search())) detach(n, character.only=TRUE) }; cat("package-acceptance-cleaned\\n")', "answer"
        );
        requireResult(cleanup.outcome === "success", "Package fixture cleanup failed");
        for (const name of initialAttached.filter(name => ["package:declared", "package:admisc", "package:splines"].includes(name)).reverse()) {
            await attach(name.slice(8), "library(" + name.slice(8) + ")");
        }
    }
};

"use strict";

// One physical install matrix, with only process/source vs worker/binary access
// behind the supplied runtime/repository adapters. Libraries are R-temp owned.
exports.checkActualPackageInstallation = async function(options) {
    const requireResult = function(condition, message) {
        if (!condition) throw Error(options.host + ": " + message);
    };
    const observations = [];
    const modes = options.partialRepository ? ["success", "truncated-install", "truncated-upgrade",
        "disconnected-install", "disconnected-upgrade"]
        : options.corruptRepository ? ["success", "failed-extraction"]
        : options.restoreInstallation ? ["success", "restore-upgrade"]
        : options.prepareReadonlyLibrary ? ["success", "readonly-library"]
        : ["success", "write-failure", "load-failure",
        ...(options.upgradeRepository ? ["upgrade", "stale-version", "unavailable-upgrade",
            "late-loaded", "restart-upgrade"] : [])];
    for (const mode of modes) {
        requireResult((await options.restart("clean")).status === "ready", "Fixture restart failed");
        let runtime = options.getRuntime();
        const query = async code => {
            const result = await runtime.executeInvisibleQuery({ query: code, source: "paired-package-install" });
            requireResult(result.status === "ready", result.message || "Actual installation query failed");
            return result.value;
        };
        const setupLibrary = async function() {
            const setup = await options.execute([
                'install_fixture_original_user <- Sys.getenv("R_LIBS_USER")',
                'install_fixture_original_libraries <- .libPaths()',
                'install_fixture_library <- tempfile("dialogforge-physical-package-")',
                mode === "write-failure" ? 'writeLines("blocked", install_fixture_library)' : 'dir.create(install_fixture_library)',
                'Sys.setenv(R_LIBS_USER=install_fixture_library)',
                'Sys.setenv(DIALOGFORGE_PACKAGE_FIXTURE_FAIL_LOAD=' + JSON.stringify(mode === "load-failure" ? "1" : "0") + ')',
                'cat("install-fixture-ready\\n")'
            ].join("; "), "answer");
            requireResult(setup.outcome === "success", "Actual private install setup failed");
        };
        await setupLibrary();
        if (mode === "readonly-library") {
            const library = await options.prepareReadonlyLibrary(await query("install_fixture_library"));
            const selected = await options.execute('install_fixture_library <- ' + JSON.stringify(library)
                + '; Sys.setenv(R_LIBS_USER=install_fixture_library); cat("readonly-library-selected\\n")', "answer");
            requireResult(selected.outcome === "success", "Readonly physical library selection failed");
        }
        const updatesInstalledPackage = ["upgrade", "stale-version", "unavailable-upgrade", "late-loaded",
            "restart-upgrade", "restore-upgrade", "truncated-upgrade", "disconnected-upgrade"].includes(mode);
        const restartsLoadedPackage = mode === "restart-upgrade" || mode === "restore-upgrade";
        if (updatesInstalledPackage) {
            const library = await query("install_fixture_library");
            const command = options.createInstallCommand(["DialogForgeInstallFixture"], {
                libraryPath: library, dependencies: false
            }).replaceAll("https://dusadrian.r-universe.dev", options.repository)
                .replaceAll("https://cloud.r-project.org", options.repository);
            const seed = await options.execute(command, "answer");
            requireResult(seed.outcome === "success", "Actual old-version seed failed: "
                + JSON.stringify(seed.returnedEvents));
            requireResult(await query('as.character(utils::packageVersion("DialogForgeInstallFixture"))')
                === "0.0.1", "Upgrade must begin with the actual old version");
            if (restartsLoadedPackage) {
                await query('local({ loadNamespace("DialogForgeInstallFixture"); "loaded" })');
            }
            if (mode === "restore-upgrade") {
                await query('local({ install_fixture_restore_marker <<- c(21L, 22L); "marker-created" })');
            }
        }
        const accepted = [];
        const outcomes = [];
        const confirmations = [];
        let restarts = 0;
        let restoredWorkspace = false;
        let retrying = false;
        const partialInstallation = mode.startsWith("truncated-") || mode.startsWith("disconnected-");
        const workflow = options.createInstall({
            getRuntimeSnapshot: () => options.getRuntime().getSnapshot(),
            getRuntimeIdentity: options.getRuntime,
            getProductId: () => "paired-physical-installation",
            getPackageSourcePolicy: () => ({ runiverse: ["DialogForgeInstallFixture"] }),
            getInstallDependencies: () => false,
            executeQuery: async code => ({ status: "ready", value: await query(code) }),
            chooseLibrary: async () => ({ action: "user" }),
            confirmRestart: async packages => {
                confirmations.push([...packages]);
                requireResult(restartsLoadedPackage, "Fresh fixture must not be loaded");
                return { action: mode === "restore-upgrade" ? "restore" : "clean" };
            },
            restartRuntime: async action => {
                requireResult(restartsLoadedPackage, "Fresh fixture must not restart for load");
                const snapshot = await options.restart(action);
                requireResult(snapshot.status === "ready", "Package-owned restart failed");
                restarts++;
                runtime = options.getRuntime();
                if (mode === "restore-upgrade") {
                    requireResult(snapshot.workspaceRestored === true, "Package-owned Restore did not acknowledge saved workspace");
                    requireResult(await query('as.character(identical(install_fixture_restore_marker, c(21L, 22L)))')
                        === "TRUE", "Package-owned Restore lost the real workspace marker");
                    requireResult(await query('as.character(is.element("DialogForgeInstallFixture", loadedNamespaces()))')
                        === "FALSE", "Restore must not reuse the previous loaded namespace");
                    restoredWorkspace = true;
                }
                await setupLibrary();
                return runtime.getSnapshot();
            },
            executeVisibleCommand: async code => {
                // Redirect only physical repository addresses in the SAME plan.
                // Version selection/verification and both branches stay intact.
                const repository = partialInstallation && !retrying
                    ? options.partialRepository + (mode.startsWith("disconnected-") ? "/disconnect" : "/truncated")
                        + (mode.endsWith("-upgrade") ? "/upgrade" : "/install")
                    : ["upgrade", "restart-upgrade", "restore-upgrade", "late-loaded",
                        "truncated-upgrade", "disconnected-upgrade"].includes(mode)
                    ? options.upgradeRepository
                    : mode === "stale-version" ? options.staleRepository
                        : mode === "failed-extraction" ? options.corruptRepository
                        : mode === "unavailable-upgrade" ? options.emptyRepository : options.repository;
                code = code.replaceAll("https://dusadrian.r-universe.dev", repository)
                    .replaceAll("https://cloud.r-project.org", repository);
                const scoped = (mode === "late-loaded" ? 'loadNamespace("DialogForgeInstallFixture");\n' : "")
                    + 'local({ physical_installer <- install.packages; install.packages <- function(pkgs, lib=NULL, repos, ...) { '
                    + 'physical_installer(pkgs, lib=lib, repos='
                    + JSON.stringify(repository)
                    + ', ...) };\n' + code + '\n})';
                const result = await options.execute(scoped, "answer");
                outcomes.push({ outcome: result.outcome,
                    output: result.records.map(record => record.event.message || "").join("").slice(-4096) });
                return { ok: result.outcome === "success", transcriptEvents: result.returnedEvents };
            },
            packagesInstalled: packages => accepted.push(...packages)
        });
        let failure = "";
        const libraryPathsBefore = mode === "readonly-library"
            ? String(await query('paste(.libPaths(), collapse="|")')) : "";
        try {
            await (updatesInstalledPackage
                ? workflow.updateRequired : workflow.installRequired)(
                ["DialogForgeInstallFixture"]
            );
        }
        catch (error) {
            failure = String(error.message || error);
        }
        try {
            const readState = async function() {
                return JSON.parse(String(await query([
                    'local({',
                    'p <- find.package("DialogForgeInstallFixture", lib.loc=install_fixture_library, quiet=TRUE)',
                    'v <- if (length(p)) as.character(utils::packageVersion("DialogForgeInstallFixture", lib.loc=install_fixture_library)) else ""',
                    'jsonlite::toJSON(list(present=length(p)>0L, version=v,',
                    'loaded=is.element("DialogForgeInstallFixture", loadedNamespaces()),',
                    'writeProbeCount=length(list.files(install_fixture_library, pattern="dialogforge-library-write-", all.files=TRUE)),',
                    'stagingDirectoryCount=length(list.files(install_fixture_library, pattern="dialogforge-package-stage-", all.files=TRUE)),',
                    'selectedLibrary=length(p)>0L && identical(normalizePath(dirname(p), mustWork=FALSE), normalizePath(install_fixture_library, mustWork=FALSE))), auto_unbox=TRUE)',
                    '})'
                ].join("\n"))));
            };
            const state = await readState();
            let value = null;
            if (["success", "upgrade", "restart-upgrade", "restore-upgrade"].includes(mode) && !failure) {
                value = Number(await query('as.character(DialogForgeInstallFixture::fixture_value())'));
            }
            const observation = { mode, accepted: [...accepted], failure, state, value, outcomes, confirmations,
                restarts, restoredWorkspace, libraryPathsChanged: mode === "readonly-library"
                    ? libraryPathsBefore !== String(await query('paste(.libPaths(), collapse="|")')) : undefined };
            observations.push(observation);
            if (partialInstallation) {
                requireResult(Boolean(failure) && accepted.length === 0,
                    "Partial physical installation must fail without publishing acceptance");
                retrying = true;
                accepted.length = 0;
                let recoveryFailure = "";
                try {
                    await (updatesInstalledPackage ? workflow.updateRequired : workflow.installRequired)(
                        ["DialogForgeInstallFixture"]
                    );
                }
                catch (error) {
                    recoveryFailure = String(error.message || error);
                }
                observation.recovery = {
                    failure: recoveryFailure, accepted: [...accepted], state: await readState(),
                    value: recoveryFailure ? null : Number(await query(
                        'as.character(DialogForgeInstallFixture::fixture_value())'
                    ))
                };
            }
        }
        finally {
            const cleanup = await options.execute([
                '.libPaths(install_fixture_original_libraries)',
                'Sys.setenv(R_LIBS_USER=install_fixture_original_user)',
                'Sys.unsetenv("DIALOGFORGE_PACKAGE_FIXTURE_FAIL_LOAD")',
                'rm(install_fixture_original_libraries, install_fixture_original_user, install_fixture_library)',
                'cat("install-fixture-cleaned\\n")'
            ].join("; "), "answer");
            requireResult(cleanup.outcome === "success", "Private installation settings restoration failed: "
                + JSON.stringify({ mode, outcomes, failure, cleanup }));
        }
    }
    requireResult((await options.restart("clean")).status === "ready", "Final private library retirement failed");
    return { host: options.host, observations, renderedPackageWorkflowChecked: false,
        publicRepositoryChecked: false, targetVersion: "0.0.1" };
};

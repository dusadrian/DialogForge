"use strict";

// ONE dependency scenario through the SAME install plan/workflow in both hosts.
exports.checkActualPackageDependencies = async function(options) {
    const requireResult = function(condition, message) {
        if (!condition) {
            throw Error(options.host + ": " + message);
        }
    };
    const observations = [];
    const modes = ["missing", "outdated", "compatible-loaded", "outdated-loaded",
        ...(options.checkPublicationRollback ? ["publish-failure", "replacement-failure", "rollback-recovery"] : [])];
    for (const mode of modes) {
        requireResult((await options.restart("clean")).status === "ready", "Dependency fixture restart failed");
        const runtime = options.getRuntime();
        const query = async code => {
            const result = await runtime.executeInvisibleQuery({ query: code, source: "paired-package-dependency" });
            requireResult(result.status === "ready", result.message || "Dependency query failed");
            return result.value;
        };
        const setup = await options.execute([
            'dependency_fixture_original_user <- Sys.getenv("R_LIBS_USER")',
            'dependency_fixture_original_libraries <- .libPaths()',
            'dependency_fixture_library <- tempfile("dialogforge-dependency-install-")',
            'dir.create(dependency_fixture_library)',
            'Sys.setenv(R_LIBS_USER=dependency_fixture_library)',
            'dependency_fixture_selected <- character(0)',
            'cat("dependency-fixture-ready\\n")'
        ].join("; "), "answer");
        requireResult(setup.outcome === "success", "Private dependency library setup failed");
        const install = async function(command, repository) {
            command = command.replaceAll("https://dusadrian.r-universe.dev", repository)
                .replaceAll("https://cloud.r-project.org", repository);
            return options.execute('local({ physical_installer <- install.packages; '
                + 'install.packages <- function(pkgs, lib=NULL, repos, ...) { physical_installer(pkgs, lib=lib, repos='
                + JSON.stringify(repository) + ', ...) };\n' + command + '\n})', "answer");
        };
        const readDependencyFingerprint = async (library = "dependency_fixture_library") => String(await query(
            'local({ p <- find.package("DialogForgeDependencyFixture", lib.loc=' + library + '); '
            + 'f <- list.files(p, recursive=TRUE, full.names=TRUE, all.files=TRUE); '
            + 'paste(basename(f), tools::md5sum(f), collapse="|") })'
        ));
        let oldDependencyFingerprint = "";
        if (mode !== "missing" && mode !== "publish-failure") {
            const seed = await install(options.createInstallCommand(["DialogForgeDependencyFixture"], {
                libraryPath: await query("dependency_fixture_library"), dependencies: false
            }), mode === "compatible-loaded" ? options.repository : options.seedRepository);
            requireResult(seed.outcome === "success", "Actual old dependency seed failed");
            requireResult(await query('as.character(utils::packageVersion("DialogForgeDependencyFixture"))')
                === (mode === "compatible-loaded" ? "0.0.2" : "0.0.1"),
            "Dependency seed was not the actual expected version");
            if (mode === "replacement-failure" || mode === "rollback-recovery") {
                oldDependencyFingerprint = await readDependencyFingerprint();
            }
            if (mode.endsWith("-loaded")) {
                const loaded = await options.execute(
                    'base::loadNamespace("DialogForgeDependencyFixture"); cat("dependency-loaded\\n")', "answer");
                requireResult(loaded.outcome === "success", "Actual dependency namespace load failed");
            }
        }
        const accepted = [];
        const outcomes = [];
        const publicationFailure = mode === "publish-failure" || mode === "replacement-failure"
            || mode === "rollback-recovery";
        let retrying = false;
        const workflow = options.createInstall({
            getRuntimeSnapshot: () => runtime.getSnapshot(), getRuntimeIdentity: () => runtime,
            getProductId: () => "paired-package-dependency",
            getPackageSourcePolicy: () => ({ runiverse: ["DialogForgeInstallFixture"] }),
            getInstallDependencies: () => false,
            executeQuery: async code => ({ status: "ready", value: await query(code) }),
            chooseLibrary: async () => ({ action: "user" }),
            confirmRestart: async () => { throw Error("Unloaded dependency fixture must not request restart"); },
            executeVisibleCommand: async command => {
                // Observe the SAME selection immediately before physical installation.
                command = command.replace("    if (is.null(.transport)) {",
                    "    .GlobalEnv$dependency_fixture_selected <- .install_packages\n"
                    + "    if (is.null(.transport)) {");
                if (publicationFailure && !retrying) {
                    // Both archives have physically installed and verified. Fail
                    // the second publication after the dependency actually moved,
                    // through ONE controlled boundary in the common plan.
                    const publication = "if (!base::file.rename(file.path(.stage, .package), .destination)) {";
                    requireResult(command.includes(publication), "Common package publication gate changed");
                    command = command.replace(publication,
                        'if (identical(.package, "DialogForgeInstallFixture") || '
                        + '!base::file.rename(file.path(.stage, .package), .destination)) {');
                    if (mode === "rollback-recovery") {
                        const restore = "if (!base::file.rename(file.path(.backup, .package), file.path(.library, .package))) {";
                        requireResult(command.includes(restore), "Common package rollback gate changed");
                        command = command.replace(restore,
                            'if (identical(.package, "DialogForgeDependencyFixture") || '
                            + '!base::file.rename(file.path(.backup, .package), file.path(.library, .package))) {');
                    }
                }
                const result = await install(command, options.repository);
                outcomes.push({ outcome: result.outcome,
                    output: result.records.map(record => record.event.message || "").join("").slice(-4096) });
                return { ok: result.outcome === "success", transcriptEvents: result.returnedEvents };
            },
            packagesInstalled: packages => accepted.push(...packages)
        });
        let failure = "";
        try {
            await workflow.installRequired(["DialogForgeInstallFixture"]);
        }
        catch (error) {
            failure = String(error.message || error);
        }
        try {
            const readVersions = async () => String(await query('paste(vapply(c("DialogForgeInstallFixture", "DialogForgeDependencyFixture"), '
                + 'function(p) { if (!length(find.package(p, lib.loc=dependency_fixture_library, quiet=TRUE))) "missing" '
                + 'else as.character(utils::packageVersion(p, lib.loc=dependency_fixture_library)) }, character(1)), collapse="|")'));
            const versions = await readVersions();
            const selected = await query('paste(dependency_fixture_selected, collapse="|")');
            const dependencyLoaded = await query('if (is.element("DialogForgeDependencyFixture", '
                + 'base::loadedNamespaces())) "loaded" else "unloaded"') === "loaded";
            const writeProbeCount = Number(await query('as.character(sum(startsWith('
                + 'list.files(dependency_fixture_library, all.files=TRUE), ".dialogforge-library-write-")))'));
            const stagingDirectoryCount = Number(await query('as.character(sum(startsWith('
                + 'list.files(dependency_fixture_library, all.files=TRUE), ".dialogforge-package-stage-")))'));
            const observation = { mode, accepted: [...accepted], failure, versions, selected,
                dependencyLoaded, writeProbeCount, stagingDirectoryCount, outcomes };
            if (mode === "replacement-failure") {
                observation.oldDependencyBytesPreserved = oldDependencyFingerprint === await readDependencyFingerprint();
            }
            if (mode === "rollback-recovery") {
                const recoveryLibrary = 'local({ stages <- list.files(dependency_fixture_library, '
                    + 'pattern="^\\\\.dialogforge-package-stage-", all.files=TRUE, full.names=TRUE); '
                    + 'stopifnot(length(stages)==1L); file.path(normalizePath(stages[[1L]], '
                    + 'winslash="/", mustWork=TRUE), ".previous") })';
                const backupLibrary = String(await query(recoveryLibrary));
                observation.recoveryDirectory = backupLibrary;
                observation.oldDependencyBytesPreserved = oldDependencyFingerprint
                    === await readDependencyFingerprint(JSON.stringify(backupLibrary));
                // Complete recovery only in this exact private fixture directory;
                // production retains the path and reports it, without deletion.
                const restored = await options.execute('local({ stage <- dirname(' + JSON.stringify(backupLibrary)
                    + '); stopifnot(startsWith(basename(stage), ".dialogforge-package-stage-"), '
                    + 'identical(dirname(stage), normalizePath(dependency_fixture_library, winslash="/", mustWork=TRUE)), '
                    + '!file.exists(file.path(dependency_fixture_library, "DialogForgeDependencyFixture"))); '
                    + 'stopifnot(base::file.rename(file.path(stage, ".previous", "DialogForgeDependencyFixture"), '
                    + 'file.path(dependency_fixture_library, "DialogForgeDependencyFixture"))); '
                    + 'stopifnot(base::unlink(stage, recursive=TRUE)==0L) })', "answer");
                requireResult(restored.outcome === "success", "Private preserved-package recovery failed");
                observation.manualRecoveryBytesPreserved = oldDependencyFingerprint === await readDependencyFingerprint();
            }
            observations.push(observation);
            if (publicationFailure) {
                requireResult(Boolean(failure) && accepted.length === 0, "Failed publication was accepted");
                retrying = true;
                accepted.length = 0;
                let recoveryFailure = "";
                try {
                    await workflow.installRequired(["DialogForgeInstallFixture"]);
                }
                catch (error) {
                    recoveryFailure = String(error.message || error);
                }
                observation.recovery = { failure: recoveryFailure, accepted: [...accepted],
                    versions: await readVersions(), value: recoveryFailure ? null : Number(await query(
                        'as.character(DialogForgeInstallFixture::fixture_value())'
                    )), controlledSecondPublicationFailure: true };
            }
        }
        finally {
            const cleanup = await options.execute([
                '.libPaths(dependency_fixture_original_libraries)',
                'Sys.setenv(R_LIBS_USER=dependency_fixture_original_user)',
                'rm(dependency_fixture_original_libraries, dependency_fixture_original_user, '
                    + 'dependency_fixture_library, dependency_fixture_selected)',
                'cat("dependency-fixture-cleaned\\n")'
            ].join("; "), "answer");
            requireResult(cleanup.outcome === "success", "Actual dependency cleanup failed");
        }
    }
    requireResult((await options.restart("clean")).status === "ready", "Dependency final retirement failed");
    return { host: options.host, observations, renderedProductChecked: false };
};

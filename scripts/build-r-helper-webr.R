suppressPackageStartupMessages(library(rwasm))
arguments <- commandArgs(trailingOnly = TRUE)
if (!is.element(length(arguments), c(2L, 3L)) || !file.exists(arguments[[1]])) {
    stop("Provide the helper source archive and package name.")
}

package_name <- arguments[[2]]
if (!is.element(package_name, c(
    "dialogforgeinspect", "dialogforgeoutput", "dialogforgetransport",
    "DialogForgeInstallFixture", "DialogForgeDependencyFixture",
    "DialogForgeCacheFixture"
))) {
    stop("Unsupported DialogForge helper package.")
}
if (!startsWith(basename(arguments[[1]]), paste0(package_name, "_")) ||
    !endsWith(arguments[[1]], ".tar.gz")) {
    stop("The source archive does not match the helper package name.")
}

runtime_version <- getOption("rwasm.webr_version")
if (!is.character(runtime_version) || length(runtime_version) != 1L ||
    is.na(runtime_version) || !grepl("^[a-zA-Z0-9_.-]+$", runtime_version)) {
    stop("Unexpected WebR build identity.")
}
destination <- file.path("/output/webr", runtime_version)
dir.create(destination, recursive = TRUE, showWarnings = FALSE)
if (length(arguments) == 3L) {
    dependency_archive <- arguments[[3]]
    if (package_name != "DialogForgeInstallFixture" ||
        !file.exists(dependency_archive) ||
        basename(dependency_archive) != "DialogForgeDependencyFixture_0.0.2.tar.gz") {
        stop("Provide the project-owned dependency fixture source archive.")
    }
    dependency_library <- tempfile("dialogforge-build-dependency-")
    dir.create(dependency_library)
    utils::install.packages(dependency_archive, repos = NULL, type = "source",
        lib = dependency_library)
    .libPaths(c(dependency_library, .libPaths()))
    Sys.setenv(R_LIBS = dependency_library)
}
rwasm:::wasm_build(package_name, arguments[[1]], destination, TRUE)
message("WebR helper archive: ", destination)

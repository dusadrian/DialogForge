args <- commandArgs(trailingOnly = FALSE)
script <- sub("^--file=", "", args[startsWith(args, "--file=")][[1L]])
root <- dirname(dirname(normalizePath(script)))
fixture <- new.env(parent = baseenv())
sys.source(file.path(
    root, "src/runtime/providers/r/r-sources/runtimeOrderedCapturePrototype.R"
), envir = fixture)

rejects <- function(action) inherits(tryCatch(action(), error = identity), "error")
calls <- 0L
version <- "0.1.0"
namespace <- new.env(parent = emptyenv())
namespace$open_output_capture <- function(path) path
namespace$seal_output_capture <- function(capture) 1
namespace$abort_output_capture <- function(capture) invisible(NULL)
fixture$dir.exists <- function(path) !identical(path, "missing")
fixture$normalizePath <- function(path) paste0("/resolved/", path)
fixture$loadNamespace <- function(package, lib.loc) {
    stopifnot(identical(package, "dialogforgeruntime"))
    calls <<- calls + 1L
    namespace
}
fixture$getNamespaceVersion <- function(namespace) version
stopifnot(is.null(fixture$runtime_ordered_output_config), calls == 0L)

# Both environments invoke this same factory; only library/directory locations differ.
for (library in c("native-library", "webr-library")) {
    config <- fixture$runtime_create_ordered_output_config(library, "capture", "session")
    stopifnot(identical(config$session_id, "session"))
    stopifnot(identical(config$directory, "/resolved/capture"))
    stopifnot(identical(config$backend$open, namespace$open_output_capture))
    stopifnot(identical(config$backend$seal, namespace$seal_output_capture))
    stopifnot(identical(config$backend$abort, namespace$abort_output_capture))
}
stopifnot(calls == 2L, is.null(fixture$runtime_ordered_output_config))
stopifnot(rejects(function() fixture$runtime_create_ordered_output_config("missing", "capture", "session")))
stopifnot(rejects(function() fixture$runtime_create_ordered_output_config("library", "capture", "")))
version <- "other"
stopifnot(rejects(function() fixture$runtime_create_ordered_output_config("library", "capture", "session")))
version <- "0.1.0"
namespace$seal_output_capture <- NULL
stopifnot(rejects(function() fixture$runtime_create_ordered_output_config("library", "capture", "session")))

launcher <- readLines(file.path(root, "src/runtime/providers/r/r-sources/runtimeControlLauncher.R"))
browser <- readLines(file.path(root, "src/runtime/providers/webr/webRSharedRuntimeControl.ts"))
initialization <- new.env(parent = baseenv())
sys.source(file.path(root, "src/runtime/providers/r/r-sources/runtimeInitialization.R"), initialization)
stopifnot(sum(initialization$runtime_control_source_names() == "runtimeOrderedCapturePrototype.R") == 1L)
stopifnot(any(grepl("runtime_control_source_names()", launcher, fixed = TRUE)))
stopifnot(any(grepl("runtime_control_source_names()", browser, fixed = TRUE)))
cat("Shared capture/configuration source cases passed; real native/WebR helper acceptance remains separate.\n")

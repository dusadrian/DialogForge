arguments <- commandArgs(trailingOnly = FALSE)
script <- sub("^--file=", "", arguments[startsWith(arguments, "--file=")])
root <- normalizePath(file.path(dirname(script), ".."))
source_path <- file.path(root, "src/runtime/providers/r/r-sources")

check_graphics_device_retirement <- function(runtime) {
    namespace <- asNamespace("grDevices")
    attached <- as.environment("package:grDevices")
    original_namespace <- get("dev.off", namespace)
    original_attached <- get("dev.off", attached)
    current <- NULL
    on.exit({
        if (!is.null(current) && is.element(as.integer(current), grDevices::dev.list())) {
            original_namespace(current)
        }
    })

    grDevices::pdf(NULL)
    current <- grDevices::dev.cur()
    runtime$runtime_register_graphics_device()
    stopifnot(identical(get("dev.off", namespace), original_namespace))
    stopifnot(identical(get("dev.off", attached), original_attached))
    key <- as.character(as.integer(current))
    failed <- try(grDevices::dev.off(1L), silent = TRUE)
    stopifnot(inherits(failed, "try-error"))
    stopifnot(!is.null(runtime$runtime_graphics_devices[[key]]))
    closed <- dev.off(current)
    stopifnot(identical(closed, grDevices::dev.cur()))
    stopifnot(is.null(runtime$runtime_select_graphics_device()))
    stopifnot(is.null(runtime$runtime_graphics_devices[[key]]))

    grDevices::pdf(NULL)
    current <- grDevices::dev.cur()
    stopifnot(as.character(as.integer(current)) == key)
    stopifnot(is.null(runtime$runtime_select_graphics_device()))
}

check_replaced_graphics_device <- function(runtime, backend) {
    grDevices::pdf(NULL)
    current <- grDevices::dev.cur()
    on.exit(grDevices::dev.off(current))
    key <- as.character(as.integer(current))

    runtime$runtime_graphics_devices[[key]] <- list(
        name = if (identical(backend, "httpgd")) "unigd" else "canvas",
        generation = 1L
    )
    stopifnot(is.null(runtime$runtime_select_graphics_device()))
    stopifnot(is.null(runtime$runtime_graphics_devices[[key]]))

    runtime$runtime_register_graphics_device()
    stopifnot(identical(runtime$runtime_graphics_devices[[key]]$name, names(current)))
    stopifnot(runtime$runtime_select_graphics_device() == runtime$runtime_graphics_device_generation)
}

check_low_level_graphics_retirement <- function(runtime) {
    grDevices::pdf(NULL)
    first <- grDevices::dev.cur()
    runtime$runtime_register_graphics_device()
    key <- as.character(as.integer(first))
    original <- runtime$runtime_graphics_devices[[key]]$observation
    stopifnot(runtime$runtime_graphics_device_is_current(original, first))
    .External(get("C_devoff", asNamespace("grDevices")), as.integer(first))
    grDevices::pdf(NULL)
    replacement <- grDevices::dev.cur()
    on.exit(grDevices::dev.off(replacement))
    stopifnot(as.integer(replacement) == as.integer(first))
    stopifnot(!runtime$runtime_graphics_device_is_current(original, replacement))
    stopifnot(is.null(runtime$runtime_select_graphics_device()))
    runtime$runtime_register_graphics_device()
    current <- runtime$runtime_graphics_devices[[key]]$observation
    stopifnot(!identical(original, current))
    stopifnot(runtime$runtime_graphics_device_is_current(current, replacement))
    stopifnot(identical(current, runtime$runtime_observe_graphics_device(replacement)))
    stopifnot(!runtime$runtime_graphics_device_is_current(current, 2147483647L))
    stopifnot(!runtime$runtime_graphics_device_is_current(current, 1L))
}

inspection_library <- Sys.getenv("DIALOGFORGE_TEST_INSPECTION_LIBRARY")
if (!nzchar(inspection_library)) {
    inspection_library <- file.path(root, "dist/r-runtime/native",
        paste(R.version$platform, getRversion(), sep = "-"))
}
inspection <- loadNamespace("dialogforgeruntime", lib.loc = inspection_library)

check_graphics_observation_cleanup <- function() {
    grDevices::pdf(NULL)
    current <- grDevices::dev.cur()
    on.exit({
        if (is.element(as.integer(current), grDevices::dev.list())) {
            grDevices::dev.off(current)
        }
    })
    token <- inspection$observe_graphics_device(current)
    stopifnot(inspection$graphics_device_is_current(token, current))
    rm(token)
    invisible(gc())
    # A finalized live observer restores the driver callback. Re-observation and
    # physical closure must work without a dangling callback or retained token.
    token <- inspection$observe_graphics_device(current)
    stopifnot(inspection$graphics_device_is_current(token, current))
    grDevices::dev.off(current)
    stopifnot(!inspection$graphics_device_is_current(token, current))
    stopifnot(inherits(try(inspection$observe_graphics_device(1L), silent = TRUE), "try-error"))
    stopifnot(inherits(try(inspection$observe_graphics_device(2147483647L), silent = TRUE), "try-error"))
}

check_graphics_observation_cleanup()

for (backend in c("httpgd", "canvas")) {
    runtime <- new.env(parent = baseenv())
    runtime$opts <- list()
    sys.source(file.path(source_path, "runtimePrelude.R"), envir = runtime)
    sys.source(file.path(source_path, "runtimePromptCore.R"), envir = runtime)
    sys.source(file.path(source_path, "runtimeGraphicsCore.R"), envir = runtime)
    runtime$runtime_observe_graphics_device <- get("observe_graphics_device", inspection)
    runtime$runtime_graphics_device_is_current <- get("graphics_device_is_current", inspection)
    check_graphics_device_retirement(runtime)
    check_low_level_graphics_retirement(runtime)
    check_replaced_graphics_device(runtime, backend)
    runtime$plot_backend <- backend
    runtime$signature <- "before"
    runtime$plot_signature <- function() runtime$signature
    runtime$device_generation <- 1L
    runtime$plot_last_device_generation <- 1L
    runtime$plot_last_count <- 1L
    runtime$runtime_select_graphics_device <- function() {
        runtime$device_generation
    }
    runtime$events <- list()
    runtime$emit_plot_event <- function(...) {
        runtime$events[[length(runtime$events) + 1L]] <- list(...)
    }
    runtime$read_count <- 0L
    runtime$publish_count <- 0L
    runtime$transport_available <- TRUE
    runtime$page_count <- 1L
    runtime$runtime_read_plot_transport <- function() {
        runtime$read_count <- runtime$read_count + 1L
        if (!runtime$transport_available) {
            return(NULL)
        }
        runtime$last_transport <- list(
            url = "fixture", viewer_url = "fixture-viewer",
            count = runtime$page_count
        )
        runtime$last_transport
    }
    if (identical(backend, "canvas")) {
        runtime$runtime_graphics_transport <- list(publish = function(transport) {
            runtime$publish_count <- runtime$publish_count + 1L
            TRUE
        })
    }

    stopifnot(!runtime$sync_runtime_plot("command-1", "before"))
    stopifnot(runtime$read_count == 1L)
    runtime$signature <- "after"
    stopifnot(runtime$sync_runtime_plot("command-1", "before"))
    stopifnot(length(runtime$events) == 1L)
    stopifnot(runtime$events[[1L]]$parent_id == "command-1")
    stopifnot(runtime$events[[1L]]$upid == "1:1:after")
    stopifnot(!runtime$sync_runtime_plot("command-1", "before"))
    stopifnot(length(runtime$events) == 1L)

    runtime$signature <- "indirect-drawing"
    stopifnot(runtime$sync_runtime_plot("command-2", "after"))
    stopifnot(length(runtime$events) == 2L)
    stopifnot(runtime$events[[2L]]$count == 1L)
    runtime$page_count <- 3L
    runtime$signature <- "two-new-pages"
    stopifnot(runtime$sync_runtime_plot("command-3", "indirect-drawing"))
    stopifnot(runtime$events[[3L]]$count == 3L)
    runtime$transport_available <- FALSE
    runtime$signature <- "other-device"
    stopifnot(!runtime$sync_runtime_plot("command-4", "two-new-pages"))
    stopifnot(runtime$plot_last_signature == "two-new-pages")

    runtime$transport_available <- TRUE
    runtime$signature <- "two-new-pages"
    runtime$device_generation <- 2L
    runtime$page_count <- 1L
    stopifnot(runtime$sync_runtime_plot("command-5", "two-new-pages"))
    stopifnot(runtime$events[[4L]]$upid == "2:1:two-new-pages")
    stopifnot(runtime$events[[4L]]$count == 1L)
    stopifnot(runtime$plot_last_device_generation == 2L)
    runtime$device_generation <- NULL
    stopifnot(!runtime$sync_runtime_plot("external-device", ""))
    stopifnot(length(runtime$events) == 4L)

    runtime$device_generation <- 2L
    runtime$page_count <- 2L
    stopifnot(runtime$sync_runtime_plot("identical-new-page", "two-new-pages"))
    stopifnot(runtime$events[[5L]]$count == 2L)
    stopifnot(runtime$events[[5L]]$upid == "2:2:two-new-pages")
    stopifnot(!runtime$sync_runtime_plot("unchanged-page", "two-new-pages"))
    stopifnot(length(runtime$events) == 5L)
}

cat("Both physical adapters use one plot-change/event owner; actual device acceptance remains required.\n")

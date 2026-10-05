# Run from the repository root in a disposable R process.
# Automatic refresh only: explicit inspection is separate.
local({
    runtime <- new.env(parent = globalenv())
    runtime$opts <- list()
    runtime$runtime_inspection_library <- Sys.getenv("DIALOGFORGE_TEST_INSPECTION_LIBRARY", unset = file.path(
        "dist/r-runtime/native", paste(R.version$platform, getRversion(), sep = "-")
    ))
    sources <- "src/runtime/providers/r/r-sources"
    for (file in c(
        "runtimePrelude.R", "runtimeBindingInspection.R", "runtimeWorkspaceCore.R",
        "runtimeDatasetCore.R", "runtimeDatasetStateCore.R"
    )) {
        sys.source(file.path(sources, file), envir = runtime)
    }
    runtime$runtime_diagnostic_count <- function(...) invisible(NULL)
    runtime$runtime_diagnostic_mark <- function(...) invisible(NULL)

    # Limit the real scan entry points to these disposable global fixtures.
    fixture_names <- c("DF_inspect_custom", "DF_inspect_nested", "DF_inspect_plain")
    stopifnot(!any(vapply(fixture_names, exists, logical(1), envir = .GlobalEnv)))
    runtime$runtime_global_names <- function() fixture_names
    on.exit(rm(list = fixture_names, envir = .GlobalEnv), add = TRUE)

    hits <- 0L
    hostile <- function(...) {
        hits <<- hits + 1L
        stop("Automatic inspection dispatched a custom method")
    }
    method_names <- character(0)
    for (method in c("dim", "length", "names", "head", "as.character", "str", "[[")) {
        method_name <- paste0(method, ".DFInspectProbe")
        stopifnot(!exists(method_name, .GlobalEnv, inherits = FALSE))
        assign(method_name, hostile, envir = .GlobalEnv)
        method_names <- c(method_names, method_name)
    }
    on.exit(rm(list = method_names, envir = .GlobalEnv), add = TRUE)
    custom <- structure(list(value = 1), class = "DFInspectProbe")
    stopifnot(inherits(try(length(custom), silent = TRUE), "try-error"))
    hits <- 0L
    reference <- new.env(parent = emptyenv())
    makeActiveBinding("value", hostile, reference)
    delayedAssign("lazy", stop("Nested promise was forced"), assign.env = reference)
    assign(fixture_names[[1]], custom, .GlobalEnv)
    assign(fixture_names[[2]], list(reference), .GlobalEnv)
    assign(fixture_names[[3]], 1:3, .GlobalEnv)

    # The restricted path must not hash/serialize the rejected object either.
    original_hash <- runtime$workspace_value_hash
    runtime$workspace_value_hash <- function(value) {
        stopifnot(runtime$workspace_stored_value_is_inspectable(value, TRUE))
        original_hash(value)
    }

    snapshot <- runtime$workspace_snapshot()
    entries <- setNames(snapshot$variables, fixture_names)
    stopifnot(
        identical(entries[[fixture_names[[1]]]]$display_type, "DFInspectProbe"),
        identical(entries[[fixture_names[[1]]]]$display_value, ""),
        !entries[[fixture_names[[1]]]]$has_viewer,
        !entries[[fixture_names[[2]]]]$has_children,
        identical(entries[[fixture_names[[3]]]]$display_value, "1, 2, 3")
    )
    previous <- runtime$workspace_state_from_snapshot(snapshot)
    changed <- runtime$collect_workspace_update(previous)
    stopifnot(length(changed$update$updated) == 2L, hits == 0L)

    # Previously tabular entries lose dataset membership when restricted.
    previous$datasetStates[[fixture_names[[1]]]] <- list(name = fixture_names[[1]])
    changed <- runtime$collect_workspace_update(previous)
    stopifnot(is.element(fixture_names[[1]], changed$update$datasets$removed))
    assign(fixture_names[[1]], 42, .GlobalEnv)
    changed <- runtime$collect_workspace_update(changed$state)
    stopifnot(identical(changed$state$variables[[fixture_names[[1]]]]$display_value, "42"))

    for (value in list(
        factor(c("a", "b")), as.Date("2026-09-29"),
        as.POSIXct("2026-09-29", tz = "UTC"), as.difftime(1, units = "days"),
        data.frame(value = 1:2, label = factor(c("a", "b")))
    )) {
        stopifnot(is.null(runtime$workspace_restricted_variable("ordinary", value, 1)))
    }
    for (value in list(
        custom, structure(data.frame(value = 1), class = c("DFInspectProbe", "data.frame")),
        list(custom), structure(1, metadata = reference), reference,
        new("externalptr"), function() NULL
    )) {
        stopifnot(!is.null(runtime$workspace_restricted_variable("restricted", value, 1)))
    }

    stopifnot(hits == 0L)
    cat("Automatic workspace inspection safety passed.\n")
})

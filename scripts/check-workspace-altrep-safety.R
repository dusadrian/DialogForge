# Build the test-only altrepprobe DLL for the target runtime before sourcing.
# The same source is intended for native R and WebR; no R-level mock is used.
local({
    dll_path <- Sys.getenv("DIALOGFORGE_ALTREP_PROBE_DLL")
    if (!nzchar(dll_path)) {
        stop("Set DIALOGFORGE_ALTREP_PROBE_DLL to the test-only compiled fixture.")
    }
    dll <- dyn.load(dll_path)
    make_probe <- getNativeSymbolInfo("make_probe", PACKAGE = dll)
    count <- getNativeSymbolInfo("callback_count", PACKAGE = dll)
    make_wrapped_probe <- getNativeSymbolInfo("make_wrapped_probe", PACKAGE = dll)
    value <- .Call(make_probe)
    before <- .Call(count)
    invisible(length(value))
    stopifnot(.Call(count) > before)

    runtime <- new.env(parent = globalenv())
    runtime$opts <- list()
    runtime$runtime_inspection_library <- Sys.getenv(
        "DIALOGFORGE_TEST_INSPECTION_LIBRARY",
        unset = file.path(
            "dist/r-runtime/native", paste(R.version$platform, getRversion(), sep = "-")
        )
    )
    for (file in c(
        "runtimePrelude.R", "runtimeBindingInspection.R", "runtimeWorkspaceCore.R",
        "runtimeDatasetCore.R", "runtimeDatasetStateCore.R"
    )) {
        sys.source(file.path("src/runtime/providers/r/r-sources", file), runtime)
    }
    runtime$runtime_diagnostic_count <- runtime$runtime_diagnostic_mark <- function(...) NULL
    name <- "DF_altrep_probe"
    stopifnot(!exists(name, .GlobalEnv, inherits = FALSE))
    on.exit(rm(list = name, envir = .GlobalEnv), add = TRUE)
    runtime$runtime_global_names <- function() name

    for (candidate in list(
        value, list(value), structure(1, metadata = value),
        structure(1, first = 42L, metadata = value),
        structure(1, metadata = value, last = 42L),
        structure(list(column = value), class = "data.frame", row.names = c(NA_integer_, -3L))
    )) {
        assign(name, candidate, .GlobalEnv)
        before <- .Call(count)
        snapshot <- runtime$workspace_snapshot()
        update <- runtime$collect_workspace_update(runtime$workspace_state_from_snapshot(snapshot))
        stopifnot(
            identical(snapshot$variables[[1]]$display_value, ""),
            !snapshot$variables[[1]]$has_viewer,
            identical(update$state$variables[[name]]$display_value, ""),
            !runtime$workspace_copy_value_is_reusable(candidate),
            .Call(count) == before
        )
    }
    assign(name, 1:3, .GlobalEnv)
    stopifnot(identical(runtime$workspace_snapshot()$variables[[1]]$display_value, "1, 2, 3"))

    # Base attribute assignment wraps long compact sequences. These are stock
    # R representations, not foreign callback-backed ALTREP implementations.
    for (candidate in list(
        structure(1:10000, label = "Integer wrapper"),
        structure(2147483648:2147493647, label = "Real wrapper")
    )) {
        stopifnot(runtime$runtime_stored_graph_is_inspectable(candidate))
    }

    # Accepting a stock wrapper must not accept a foreign ALTREP inside it.
    wrapper_template <- structure(1:10000, label = "Stock wrapper template")
    wrapped_probe <- .Call(make_wrapped_probe, wrapper_template)
    before <- .Call(count)
    stopifnot(
        !runtime$runtime_stored_graph_is_inspectable(wrapped_probe),
        .Call(count) == before
    )

    # Use the same helpers as Variables and Data edits, with declared present.
    # Small vectors do not exercise R's long-sequence wrapper representation.
    if (!requireNamespace("declared", quietly = TRUE)) {
        stop("Editor wrapper acceptance requires the declared package.")
    }
    frame <- as.data.frame(setNames(
        rep(list(seq_len(10000L)), 80L), paste0("v", seq_len(80L))
    ))
    frame$v1[1L] <- 11L
    attr(frame$v1, "label") <- "Viewport fixture"
    assign(name, frame, .GlobalEnv)
    previous <- runtime$workspace_snapshot()
    stopifnot(previous$variables[[1]]$has_viewer)
    metadata <- runtime$workspace_dataset_update_variable(name, "v1", label = "Updated viewport label")
    cell <- runtime$workspace_dataset_update_cell(name, 1L, "v1", "42")
    stopifnot(metadata$ok, cell$ok)
    updated <- runtime$collect_workspace_update(runtime$workspace_state_from_snapshot(previous))
    snapshot <- runtime$workspace_snapshot()
    stored <- get(name, .GlobalEnv, inherits = FALSE)
    stopifnot(
        snapshot$variables[[1]]$has_viewer,
        updated$state$variables[[name]]$has_viewer,
        runtime$runtime_stored_graph_is_inspectable(stored),
        stored$v1[1L] == 42L,
        identical(attr(stored$v1, "label"), "Updated viewport label")
    )

    # Member discovery reads only stored names/class and the requested pointer.
    # It must not visit an ALTREP child or an unrelated callback-backed attribute.
    members <- structure(list(alpha = value), unrelated = value)
    before <- .Call(count)
    fields <- dialogforgeruntime::stored_list_fields(members, "alpha")
    stopifnot(
        fields$inspectable, identical(fields$names, "alpha"),
        !dialogforgeruntime::stored_list_fields(fields$value)$inspectable,
        .Call(count) == before
    )
    cat("Stock wrappers remain visible after editor writes; foreign ALTREP callbacks stayed unchanged during automatic inspection.\n")
    # Keep the DLL loaded until this disposable R session ends: ALTREP instances
    # retain class/method pointers into it even after their bindings disappear.
})

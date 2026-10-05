local({
    library <- Sys.getenv("DIALOGFORGE_TEST_INSPECTION_LIBRARY", unset = "")
    helper <- if (is.element("dialogforgeruntime", loadedNamespaces())) {
        asNamespace("dialogforgeruntime")
    }
    else {
        loadNamespace("dialogforgeruntime", lib.loc = library)
    }
    stopifnot(identical(as.character(getNamespaceVersion(helper)), "0.1.0"))
    exports <- c(
        "binding_info", "closure_is_compiled", "rebind_compiled_closure",
        "stored_list_fields", "stored_graph_is_inspectable",
        "observe_graphics_device", "graphics_device_is_current",
        "graphics_device_is_open", "match_stored_names",
        "read_bounded_runtime_request", "write_checked_runtime_frame",
        "read_runtime_console_line", "with_runtime_console_input",
        "open_output_capture", "seal_output_capture", "abort_output_capture"
    )
    stopifnot(identical(sort(getNamespaceExports(helper)), sort(exports)))
    stopifnot(all(vapply(exports, function(name) {
        is.function(get(name, envir = helper, inherits = FALSE))
    }, logical(1))))
    expected <- c(
        df_binding_info = 2L, df_stored_graph_is_inspectable = 5L,
        df_closure_is_compiled = 1L, df_rebind_compiled_closure = 3L,
        df_stored_list_fields = 2L, df_observe_graphics_device = 1L,
        df_graphics_device_is_current = 2L, df_graphics_device_is_open = 2L,
        df_match_stored_names = 2L, df_read_bounded_request = 2L,
        df_write_runtime_frame = 2L, df_read_runtime_console_line = 3L,
        df_with_runtime_console_input = 2L, df_output_open = 1L,
        df_output_seal = 1L, df_output_abort = 1L
    )
    dll <- getLoadedDLLs()[["dialogforgeruntime"]]
    stopifnot(!is.null(dll), !dll[["dynamicLookup"]])
    registered <- getDLLRegisteredRoutines(dll)[[".Call"]]
    actual <- vapply(registered, function(routine) routine$numParameters, integer(1))
    stopifnot(identical(actual, expected))
    cat("Single runtime namespace: all 16 exports and registered native routines are available.\n")
})

runtime_control_source_names <- function(stage = "core") {
    if (identical(stage, "dispatch")) {
        return(c("runtimeDispatchCore.R", "runtimeConsoleBindings.R"))
    }

    if (!identical(stage, "core")) {
        stop("Unknown runtime source loading stage.")
    }

    c(
        "backend.R",
        "runtimePrelude.R",
        "runtimeBindingInspection.R",
        "runtimeDiagnostics.R",
        "runtimeWorkspaceCore.R",
        "runtimeDatasetStateCore.R",
        "runtimeDatasetCore.R",
        "runtimeCompletionCore.R",
        "runtimeHelpCore.R",
        "runtimeEventCore.R",
        "runtimePromptCore.R",
        "runtimeWorkerPromptTransport.R",
        "runtimeGraphicsCore.R",
        "runtimeWarningCore.R",
        "runtimeOrderedCapturePrototype.R",
        "runtimeTransportCore.R"
    )
}


runtime_read_control_compilation_cache <- function(path) {
    if (!is.character(path) || length(path) != 1L || !nzchar(path)) {
        return(NULL)
    }
    tryCatch({
        size <- file.info(path)$size
        if (is.na(size) || size > 10 * 1024 * 1024) {
            return(NULL)
        }
        cache <- readRDS(path)
        if (
            !is.list(cache) ||
            !identical(cache$format, 1L) ||
            !identical(cache$r_version, paste(
                R.version$major, strsplit(R.version$minor, ".", fixed = TRUE)[[1L]][[1L]],
                sep = "."
            )) ||
            !identical(cache$optimization, compiler::getCompilerOption("optimize")) ||
            !is.list(cache$functions) ||
            length(cache$functions) > 1000L
        ) {
            return(NULL)
        }
        cache$functions
    }, error = function(error) NULL)
}


runtime_prepare_control_functions <- function(runtime) {
    # Prepare our installed closures before accepting commands. First-use JIT
    # compilation during a workspace scan can dispatch user unique() methods
    # inside R's compiler, even when our bookkeeping uses unique.default().
    prepared <- character(0)
    cache_hits <- 0L
    previous <- runtime$runtime_prepared_control_functions
    if (is.null(previous)) {
        previous <- list()
    }
    for (name in ls(envir = runtime, all.names = TRUE)) {
        binding <- runtime$runtime_binding_info(runtime, name)
        if (!is.element(binding$state, c("value", "forced"))) {
            next
        }
        value <- binding$value
        if (
            typeof(value) != "closure" ||
            !identical(environment(value), runtime)
        ) {
            next
        }
        if (identical(value, previous[[name]])) {
            next
        }

        cached <- runtime$runtime_control_compilation_cache[[name]]
        source_value <- value
        if (
            typeof(cached) == "closure" &&
            !is.null(attr(value, "srcref", exact = TRUE))
        ) {
            # Worker parse() retains nested source references; native source()
            # usually does not. Compare the same executable syntax, not the
            # host's source-location attributes. Keep the original for rebinding.
            source_value <- utils::removeSource(value)
        }
        if (
            typeof(cached) == "closure" &&
            isTRUE(runtime$runtime_control_closure_is_compiled(cached)) &&
            identical(source_value, cached, ignore.environment = TRUE)
        ) {
            compiled <- runtime$runtime_rebind_compiled_control_closure(cached, runtime, value)
            cache_hits <- cache_hits + 1L
        }
        else {
            compiled <- compiler::cmpfun(value)
        }
        assign(name, compiled, envir = runtime)
        previous[[name]] <- compiled
        prepared <- c(prepared, name)
    }

    runtime$runtime_prepared_control_functions <- previous
    runtime$runtime_control_compilation_cache_hits <- cache_hits
    invisible(prepared)
}


runtime_initialize_environment <- function(options = list()) {
    if (!is.element("DialogApp", search())) {
        attach(NULL, name = "DialogApp", warn.conflicts = FALSE)
    }

    runtime <- as.environment("DialogApp")
    if (
        exists("app_env", envir = runtime, inherits = FALSE) &&
        is.environment(runtime$app_env)
    ) {
        runtime <- runtime$app_env
    }
    runtime$app_env <- runtime
    runtime$runtime_prepare_control_functions <- runtime_prepare_control_functions
    runtime$runtime_read_control_compilation_cache <- runtime_read_control_compilation_cache
    runtime$runtime_control_compilation_cache <- NULL
    runtime$opts <- utils::modifyList(list(
        meta_path = "",
        events_path = "",
        trace_path = "",
        trace_enabled = FALSE,
        session_kind = "interactive",
        token = "",
        port = 0L
    ), options)
    runtime$trace <- function(message) invisible(NULL)
    runtime$dialog_last_traceback <- NULL
    runtime$dialog_record_traceback <- function() {
        app_env$dialog_last_traceback <- sys.calls()

        invisible(NULL)
    }
    environment(runtime$dialog_record_traceback) <- runtime
    runtime$event_seq <- 0L
    runtime$current_activity_id <- ""
    runtime$active_prompt_id <- ""
    runtime$pending_prompt_reply <- NULL
    runtime$runtime_prompt_transport_read <- NULL
    runtime$runtime_prompt_transport_publish <- NULL
    runtime$runtime_console_input_evaluator <- NULL
    runtime$runtime_console_input_reader <- NULL
    runtime$runtime_live_event_transport_write <- NULL
    runtime$completion_queue <- list()
    runtime$live_events_enabled <- FALSE
    runtime$runtime_collected_events <- NULL

    runtime
}

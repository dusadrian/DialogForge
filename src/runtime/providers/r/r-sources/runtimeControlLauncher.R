local({
  runtime_r_dir <- as.character(Sys.getenv("DM_RUNTIME_R_DIR", unset = ""))

  if (!nzchar(runtime_r_dir)) {
    stop("Missing DM_RUNTIME_R_DIR")
  }

  source(file.path(runtime_r_dir, "runtimeInitialization.R"), local = TRUE)
  runtime_env <- runtime_initialize_environment(list(
    meta_path = as.character(Sys.getenv("DM_RUNTIME_CONTROL_META", unset = "")),
    events_path = as.character(Sys.getenv("DM_RUNTIME_EVENTS", unset = "")),
    trace_path = as.character(Sys.getenv("DM_RUNTIME_CONTROL_TRACE", unset = "")),
    trace_enabled = identical(Sys.getenv("DIALOGR_DSDBG", unset = ""), "1") ||
      identical(Sys.getenv("DM_RUNTIME_CONTROL_TRACE_ENABLED", unset = ""), "1"),
    session_kind = as.character(Sys.getenv("DM_RUNTIME_CONTROL_SESSION_KIND", unset = "interactive")),
    token = as.character(Sys.getenv("DM_RUNTIME_CONTROL_TOKEN", unset = "")),
    port = suppressWarnings(as.integer(Sys.getenv("DM_RUNTIME_CONTROL_PORT", unset = "0")))
  ))

  source_runtime_file <- function(path) {
    source(path, local = runtime_env, echo = FALSE, verbose = FALSE, print.eval = FALSE)
  }

  for (name in runtime_control_source_names()) {
    source_runtime_file(file.path(runtime_r_dir, name))
  }
    runtime_env$runtime_install_console_input_scope()
    transport_namespace <- runtime_env$runtime_console_transport_namespace()
    runtime_env$runtime_native_frame_writer <- compiler::cmpfun(
        get("write_checked_runtime_frame", transport_namespace)
    )
    runtime_env$runtime_native_frame_reader <- compiler::cmpfun(
        get("read_bounded_runtime_request", transport_namespace)
    )
    runtime_env$runtime_bounded_input_config <- NULL
    if (identical(Sys.getenv("DM_BOUNDED_INPUT_ENABLED"), "1")) {
        transport_library <- Sys.getenv("DIALOGFORGE_TRANSPORT_LIBRARY")
        if (!nzchar(transport_library) || !dir.exists(transport_library)) {
            stop("Bounded input prototype requires its isolated native library.")
        }
        runtime_env$runtime_bounded_input_config <- list(
            reader = runtime_env$runtime_native_frame_reader
        )
    }
    if (identical(Sys.getenv("DM_ORDERED_OUTPUT_ENABLED"), "1")) {
        output_library <- Sys.getenv("DIALOGFORGE_OUTPUT_LIBRARY")
        if (!nzchar(output_library)) {
            output_library <- file.path(
                Sys.getenv("DM_RUNTIME_OUTPUT_ROOT"),
                paste(R.version$platform, getRversion(), sep = "-")
            )
        }
        output_directory <- Sys.getenv("DM_ORDERED_OUTPUT_DIR")
        output_session <- Sys.getenv("DM_ORDERED_OUTPUT_SESSION")
        if (!nzchar(output_library) || !dir.exists(output_directory) || !nzchar(output_session)) {
            stop("Ordered output requires its runtime library and private session directory.")
        }
        if (!isTRUE(l10n_info()$`UTF-8`)) {
            stop("Ordered output prototype requires a confirmed UTF-8 native locale.")
        }
        runtime_env$runtime_ordered_output_config <- runtime_env$runtime_create_ordered_output_config(
            output_library, output_directory, output_session
        )
    }
  profile_runtime_control_path <- as.character(Sys.getenv("DM_PROFILE_RUNTIME_CONTROL_PATH", unset = ""))
  if (nzchar(profile_runtime_control_path) && file.exists(profile_runtime_control_path)) {
    source(profile_runtime_control_path, local = runtime_env, echo = FALSE, verbose = FALSE, print.eval = FALSE)
  }
  for (name in runtime_control_source_names("dispatch")) {
    source_runtime_file(file.path(runtime_r_dir, name))
  }
    compilation_cache_path <- Sys.getenv(
        "DM_RUNTIME_CONTROL_COMPILATION_CACHE",
        unset = file.path(runtime_r_dir, "runtime-control-cache.rds")
    )
    if (nzchar(compilation_cache_path)) {
        runtime_env$runtime_control_compilation_cache <-
            runtime_read_control_compilation_cache(compilation_cache_path)
    }
    runtime_prepare_control_functions(runtime_env)
  source_runtime_file(file.path(runtime_r_dir, "runtimeControlBootstrap.R"))
})

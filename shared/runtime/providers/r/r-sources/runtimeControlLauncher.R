local({
  runtime_r_dir <- as.character(Sys.getenv("DM_RUNTIME_R_DIR", unset = ""))

  if (!nzchar(runtime_r_dir)) {
    stop("Missing DM_RUNTIME_R_DIR")
  }

  if (!is.element("DialogApp", search())) {
    attach(NULL, name = "DialogApp", warn.conflicts = FALSE)
  }

  runtime_env <- as.environment("DialogApp")
  runtime_env$opts <- list(
    meta_path = as.character(Sys.getenv("DM_RUNTIME_CONTROL_META", unset = "")),
    events_path = as.character(Sys.getenv("DM_RUNTIME_EVENTS", unset = "")),
    trace_path = as.character(Sys.getenv("DM_RUNTIME_CONTROL_TRACE", unset = "")),
    trace_enabled = identical(Sys.getenv("DIALOGR_DSDBG", unset = ""), "1") ||
      identical(Sys.getenv("DM_RUNTIME_CONTROL_TRACE_ENABLED", unset = ""), "1"),
    session_kind = as.character(Sys.getenv("DM_RUNTIME_CONTROL_SESSION_KIND", unset = "interactive")),
    token = as.character(Sys.getenv("DM_RUNTIME_CONTROL_TOKEN", unset = "")),
    port = suppressWarnings(as.integer(Sys.getenv("DM_RUNTIME_CONTROL_PORT", unset = "0")))
  )

  source_runtime_file <- function(path) {
    source(path, local = runtime_env, echo = FALSE, verbose = FALSE, print.eval = FALSE)
  }

  source_runtime_file(file.path(runtime_r_dir, "backend.R"))
  source_runtime_file(file.path(runtime_r_dir, "runtimePrelude.R"))
  source_runtime_file(file.path(runtime_r_dir, "runtimeWorkspaceCore.R"))
  source_runtime_file(file.path(runtime_r_dir, "runtimeDatasetStateCore.R"))
  source_runtime_file(file.path(runtime_r_dir, "runtimeDatasetCore.R"))
  source_runtime_file(file.path(runtime_r_dir, "runtimeCompletionCore.R"))
  source_runtime_file(file.path(runtime_r_dir, "runtimeHelpCore.R"))
  source_runtime_file(file.path(runtime_r_dir, "runtimeEventCore.R"))
  source_runtime_file(file.path(runtime_r_dir, "runtimePromptCore.R"))
  source_runtime_file(file.path(runtime_r_dir, "runtimeGraphicsCore.R"))
  source_runtime_file(file.path(runtime_r_dir, "runtimeWarningCore.R"))
  source_runtime_file(file.path(runtime_r_dir, "runtimeTransportCore.R"))
  profile_runtime_control_path <- as.character(Sys.getenv("DM_PROFILE_RUNTIME_CONTROL_PATH", unset = ""))
  if (nzchar(profile_runtime_control_path) && file.exists(profile_runtime_control_path)) {
    source(profile_runtime_control_path, local = runtime_env, echo = FALSE, verbose = FALSE, print.eval = FALSE)
  }
  source_runtime_file(file.path(runtime_r_dir, "runtimeDispatchCore.R"))
  source_runtime_file(file.path(runtime_r_dir, "runtimeControlBootstrap.R"))
})

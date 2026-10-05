args <- commandArgs(trailingOnly = FALSE)
script <- sub("^--file=", "", args[startsWith(args, "--file=")][[1L]])
root <- dirname(dirname(normalizePath(script)))
fixture <- new.env(parent = globalenv())
sys.source(file.path(root, "src/runtime/providers/r/r-sources/runtimeInitialization.R"), fixture)

check_initialization <- function() {
    if (is.element("DialogApp", search())) {
        stop("Run the initialization fixture in an isolated R session.")
    }
    on.exit(detach("DialogApp", character.only = TRUE), add = TRUE)

    runtime <- fixture$runtime_initialize_environment()
    stopifnot(identical(runtime, as.environment("DialogApp")))
    stopifnot(identical(runtime$app_env, runtime))
    stopifnot(identical(runtime$event_seq, 0L))
    stopifnot(identical(runtime$current_activity_id, ""))
    stopifnot(identical(runtime$active_prompt_id, ""))
    stopifnot(is.null(runtime$pending_prompt_reply))
    stopifnot(identical(runtime$completion_queue, list()))
    stopifnot(!runtime$live_events_enabled)
    runtime$dialog_record_traceback()
    stopifnot(length(runtime$dialog_last_traceback) > 0L)

    native <- fixture$runtime_initialize_environment(list(token = "fixture", port = 1234L))
    stopifnot(identical(native, runtime))
    stopifnot(identical(native$opts$token, "fixture"))
    stopifnot(identical(native$opts$port, 1234L))
    stopifnot(identical(native$opts$session_kind, "interactive"))
    stopifnot(is.null(native$dialog_last_traceback))

    native$safe <- function(expression) {
        tryCatch(expression, error = function(error) NULL)
    }
    native$install_prompt_hooks <- function() invisible(TRUE)
    previousPager <- getOption("pager")
    on.exit(options(pager = previousPager), add = TRUE)
    previousBrowser <- getOption("browser")
    on.exit(options(browser = previousBrowser), add = TRUE)
    sys.source(file.path(root, "src/runtime/providers/r/r-sources/runtimeHelpCore.R"), native)
    sys.source(file.path(root, "src/runtime/providers/r/r-sources/runtimeConsoleBindings.R"), native)
    stopifnot(identical(getOption("pager"), native$runtime_console_pager))
    stopifnot(identical(getOption("browser"), native$runtime_help_browser))
    stopifnot(identical(native$plot, graphics::plot))
    stopifnot(is.function(native$traceback))
    pagerFile <- tempfile("runtime-pager-fixture-")
    writeLines(c("first line", "second line"), pagerFile)
    on.exit(unlink(pagerFile), add = TRUE)
    output <- capture.output(native$runtime_console_pager(
        pagerFile, header = "Fixture", delete.file = TRUE
    ))
    stopifnot(identical(output, c("Fixture", "first line", "second line")))
    stopifnot(!file.exists(pagerFile))

    core <- fixture$runtime_control_source_names()
    stopifnot(!anyDuplicated(core))
    stopifnot(all(file.exists(file.path(root, "src/runtime/providers/r/r-sources", core))))
    stopifnot(identical(fixture$runtime_control_source_names("dispatch"),
        c("runtimeDispatchCore.R", "runtimeConsoleBindings.R")))
    stopifnot(inherits(tryCatch(
        fixture$runtime_control_source_names("unknown"), error = identity
    ), "error"))
}

check_initialization()
cat("Common runtime initialization source cases passed; real startup acceptance remains separate.\n")

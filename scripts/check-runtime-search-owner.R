# Stable runtime state must survive package attachment/search-path repositioning.
# Run only in a disposable R process from the repository root.
local({
    original_pager <- getOption("pager")
    on.exit(options(pager = original_pager), add = TRUE)
    sources <- "src/runtime/providers/r/r-sources"
    sys.source(file.path(sources, "runtimeInitialization.R"), envir = environment())
    runtime <- runtime_initialize_environment()
    runtime$runtime_inspection_library <- Sys.getenv(
        "DIALOGFORGE_TEST_INSPECTION_LIBRARY", unset = file.path(
            "dist/r-inspection/native", paste(R.version$platform, getRversion(), sep = "-")
        )
    )
    for (name in runtime_control_source_names()) {
        sys.source(file.path(sources, name), envir = runtime)
    }
    sys.source(file.path(sources, "runtimeConsoleBindings.R"), envir = runtime)
    runtime$fixture_value <- 0L
    runtime$advance_fixture_value <- function() {
        fixture_value <<- fixture_value + 1L
        fixture_value
    }
    environment(runtime$advance_fixture_value) <- runtime
    runtime_prepare_control_functions(runtime)
    binding_hits <- 0L
    makeActiveBinding("active_search_fixture", function() {
        binding_hits <<- binding_hits + 1L
        stop("Search-path maintenance evaluated an active binding")
    }, runtime)
    delayedAssign("lazy_search_fixture", {
        binding_hits <<- binding_hits + 1L
        stop("Search-path maintenance evaluated a delayed binding")
    }, assign.env = runtime)

    for (index in seq_len(3L)) {
        attachment <- paste0("DF_search_owner_", index)
        attach(list(), name = attachment, warn.conflicts = FALSE)
        runtime$install_runtime_console_bindings()
        search_environment <- as.environment("DialogApp")
        stopifnot(
            identical(search()[[2L]], "DialogApp"),
            identical(search_environment$app_env, runtime),
            identical(environment(search_environment$advance_fixture_value), runtime)
        )
        value <- search_environment$advance_fixture_value()
        stopifnot(identical(search_environment$fixture_value, value))
        stopifnot(binding_hits == 0L)
        stopifnot(bindingIsActive("fixture_value", search_environment))
        search_environment$fixture_value <- 40L + index
        stopifnot(identical(runtime$fixture_value, 40L + index))
        detach(attachment, character.only = TRUE)
    }
    runtime$fixture_value <- 99L
    stopifnot(identical(as.environment("DialogApp")$fixture_value, 99L))
    runtime$late_fixture_value <- 123L
    runtime$install_runtime_console_bindings()
    stopifnot(identical(as.environment("DialogApp")$late_fixture_value, 123L))
    initialized <- runtime_initialize_environment()
    stopifnot(identical(initialized, runtime))
    stopifnot(binding_hits == 0L)
    stopifnot(is.function(getOption("pager")))
    cat("Shared stable runtime search owner cases passed.\n")
})

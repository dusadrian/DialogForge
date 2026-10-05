sources <- "src/runtime/providers/r/r-sources"
runtime <- new.env(parent = baseenv())
runtime$`%||%` <- function(value, fallback) {
    if (is.null(value)) {
        return(fallback)
    }
    value
}
sys.source(file.path(sources, "runtimeWarningCore.R"), runtime)
sys.source(file.path(sources, "runtimeDispatchCore.R"), runtime)
evalq({
    runtime_diagnostic_mark <- function(...) invisible(NULL)
    trace <- function(...) invisible(NULL)
    app_env <- new.env(parent = baseenv())
    app_env$dialog_record_traceback <- function() invisible(NULL)
}, runtime)

check_capture_sinks <- function(outer) {
    outer_output <- character(0)
    outer_messages <- character(0)
    output_connection <- textConnection("outer_output", "w", local = TRUE)
    message_connection <- textConnection("outer_messages", "w", local = TRUE)
    original_depth <- sink.number(type = "output")
    original_message <- sink.number(type = "message")
    on.exit({
        sink(type = "message")
        while (sink.number(type = "output") > original_depth) {
            sink()
        }
        close(output_connection)
        close(message_connection)
    })
    if (outer) {
        sink(output_connection)
        sink(message_connection, type = "message")
    }
    expected_depth <- sink.number(type = "output")
    expected_message <- sink.number(type = "message")
    path <- tempfile("df-capture-unbalanced-")
    assign("DF_capture_sink_path", path, .GlobalEnv)
    on.exit({
        connection <- get0("DF_capture_sink_connection", .GlobalEnv, inherits = FALSE)
        if (!is.null(connection)) {
            try(close(connection), silent = TRUE)
        }
        unlink(path)
        rm(list = intersect(c("DF_capture_sink_path", "DF_capture_sink_connection"),
            ls(.GlobalEnv)), envir = .GlobalEnv)
    }, add = TRUE)
    result <- runtime$runtime_capture_input(paste(
        'DF_capture_sink_connection <- file(DF_capture_sink_path, "wt");',
        'sink(DF_capture_sink_connection); cat("hidden\\n"); invisible(NULL)'
    ), "sink-fixture")
    stopifnot(result$ok, !length(result$output))
    stopifnot(sink.number(type = "output") == expected_depth)
    stopifnot(sink.number(type = "message") == expected_message)
    recovered <- runtime$runtime_capture_input('cat("recovered\\n")', "sink-recovered")
    stopifnot(recovered$ok, identical(recovered$output, "recovered"))
    if (outer) {
        cat("outer-output\n")
        cat("outer-message\n", file = stderr())
        stopifnot(identical(outer_output, "outer-output"))
        stopifnot(identical(outer_messages, "outer-message"))
    }
    stopifnot(original_message == 2L)
}

for (outer in c(FALSE, TRUE)) {
    check_capture_sinks(outer)
}

for (level in c(-1L, 0L, 1L, 2L)) {
    code <- sprintf(paste0(
        'local({ old <- options(warn=%d); on.exit(options(old)); ',
        'warning("policy marker", call.=FALSE); cat("after\\n") })'
    ), level)
    previous_level <- getOption("warn")
    result <- runtime$runtime_capture_input(code, "warning-policy")
    stopifnot(identical(getOption("warn"), previous_level))

    if (level >= 2L) {
        stopifnot(!result$ok, !length(result$output), !length(result$warnings))
        stopifnot(identical(result$error, "(converted from warning) policy marker"))
    } else {
        stopifnot(result$ok, identical(result$output, "after"))
        expected <- if (level < 0L) character(0) else "policy marker"
        stopifnot(identical(result$warnings, expected))
    }
}
cat("Shared input capture preserves caller sinks and unwinds added nested routing.\n")
cat("Shared input warning policy respects suppression and conversion to errors.\n")

local({
    previous <- options(warn = 2L)
    on.exit(options(previous))
    observed <- FALSE
    withCallingHandlers(
        signalCondition(simpleWarning("signalled marker")),
        warning = function(warning) {
            observed <<- runtime$runtime_accept_input_warning(warning, "")
        }
    )
    stopifnot(observed)

    converted <- tryCatch(
        withCallingHandlers(
            warning(simpleWarning("original call marker", call = quote(original_call()))),
            warning = function(warning) runtime$runtime_accept_input_warning(warning, "")
        ),
        error = identity
    )
    stopifnot(inherits(converted, "error"))
    stopifnot(identical(conditionCall(converted), quote(original_call())))
})
cat("Warning conversion preserves the original call and plain signalCondition semantics.\n")

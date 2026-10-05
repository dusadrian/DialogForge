# Shared request-owned capture loaded by native R and WebR.
# This invocation owns added output sinks above the caller's original depth.
runtime_ordered_capture_active <- FALSE
runtime_ordered_output_config <- NULL


runtime_create_ordered_output_config <- function(library, directory, session_id) {
    for (value in list(library, directory, session_id)) {
        if (
            !is.character(value) || length(value) != 1L ||
            is.na(value) || !nzchar(value)
        ) {
            stop("Ordered output requires a library, directory and session identity.")
        }
    }

    if (!dir.exists(library) || !dir.exists(directory)) {
        stop("Ordered output library or capture directory is unavailable.")
    }

    namespace <- loadNamespace("dialogforgeruntime", lib.loc = library)
    if (!identical(as.character(getNamespaceVersion(namespace)), "0.1.1")) {
        stop("Unsupported DialogForge output prototype version.")
    }

    backend <- list(
        open = get("open_output_capture", namespace),
        seal = get("seal_output_capture", namespace),
        abort = get("abort_output_capture", namespace)
    )
    if (!all(vapply(backend, is.function, logical(1)))) {
        stop("Ordered output helper does not implement open/seal/abort.")
    }

    list(
        directory = normalizePath(directory),
        session_id = session_id,
        backend = backend
    )
}


runtime_capture_ordered_input <- function(code, path, backend) {
    if (!is.character(code) || length(code) != 1L || is.na(code)) {
        stop("Ordered capture requires one code string.")
    }
    if (
        !is.list(backend) || !is.function(backend$open) ||
        !is.function(backend$seal) || !is.function(backend$abort)
    ) {
        stop("Ordered capture requires an open/seal/abort backend.")
    }
    if (runtime_ordered_capture_active) {
        stop("Nested ordered evaluations are not supported by this prototype.")
    }
    runtime_ordered_capture_active <<- TRUE
    on.exit(runtime_ordered_capture_active <<- FALSE, add = TRUE)

    original_output_depth <- sink.number(type = "output")
    original_message_number <- sink.number(type = "message")
    original_message_connection <- getConnection(original_message_number)
    capture <- NULL
    output_installed <- FALSE
    message_installed <- FALSE
    cleaned <- FALSE
    capture_errors <- character(0)
    sealed <- FALSE
    seal_sequence <- NULL
    package_warnings <- character(0)

    restore_capture_routing <- function() {
        if (cleaned) {
            return(invisible(NULL))
        }
        cleaned <<- TRUE
        # Cleanup is best effort but never silently turns failure into a seal.
        record_cleanup_failure <- function(error) {
            capture_errors <<- c(capture_errors, conditionMessage(error))
            invisible(NULL)
        }

        if (message_installed) {
            tryCatch({
                if (original_message_number == 2L) {
                    sink(type = "message")
                } else {
                    sink(original_message_connection, type = "message")
                }
            }, error = record_cleanup_failure)
        }

        if (output_installed) {
            tryCatch({
                depth <- sink.number(type = "output")
                if (depth <= original_output_depth) {
                    stop("Ordered capture output routing was removed during evaluation.")
                }
                while (sink.number(type = "output") > original_output_depth) {
                    sink(type = "output")
                }
            }, error = record_cleanup_failure)
        }

        if (!is.null(capture)) {
            if (!length(capture_errors)) {
                tryCatch({
                    seal_sequence <<- backend$seal(capture)
                    sealed <<- TRUE
                }, error = record_cleanup_failure)
            }
            if (!sealed) {
                tryCatch(backend$abort(capture), error = record_cleanup_failure)
            }
            tryCatch(close(capture$stdout), error = record_cleanup_failure)
            tryCatch(close(capture$stderr), error = record_cleanup_failure)
        }

        invisible(NULL)
    }
    on.exit(suspendInterrupts(restore_capture_routing()), add = TRUE)

    capture <- backend$open(path)
    sink(capture$stdout, type = "output")
    output_installed <- TRUE
    sink(capture$stderr, type = "message")
    message_installed <- TRUE

    result <- tryCatch({
        allowInterrupts(withCallingHandlers({
            value <- withVisible(eval(parse(text = code), envir = .GlobalEnv))
            if (isTRUE(value$visible)) {
                runtime_print_visible_value(value$value)
            }
            list(ok = TRUE, interrupted = FALSE, error = "")
        }, warning = function(warning) {
            text <- conditionMessage(warning)
            if (!runtime_accept_input_warning(warning, code)) {
                tryInvokeRestart("muffleWarning")
                return(invisible(NULL))
            }
            # Observe for the existing app diagnostic, but do not re-emit warnings.
            if (is_package_loading_warning(text)) {
                package_warnings <<- c(package_warnings, text)
            }
        }, error = function(error) {
            # Record while the failing evaluation's call stack is still present.
            app_env$dialog_record_traceback()
        }))
    },
        interrupt = function(interrupt) {
            list(ok = TRUE, interrupted = TRUE, error = "")
        },
        error = function(error) {
            list(ok = FALSE, interrupted = FALSE, error = conditionMessage(error))
        }
    )

    # Keep R's queue/formatting instead of converting warn=0 into warn=1.
    # This internal emits R's "In addition:" prefix; exact app presentation is
    # an explicit integration requirement, not accepted prototype parity.
    suspendInterrupts({
        tryCatch({
            # A command may temporarily redirect messages. Flush its deferred
            # queue to its capture, not to that temporary destination.
            sink(capture$stderr, type = "message")
            .Internal(printDeferredWarnings())
        }, error = function(error) {
            capture_errors <<- c(capture_errors, conditionMessage(error))
        })
        restore_capture_routing()
    })

    list(
        ok = result$ok,
        interrupted = result$interrupted,
        error = result$error,
        capture_status = if (sealed && !length(capture_errors)) "sealed" else "failed",
        capture_errors = capture_errors,
        output_sequence = seal_sequence,
        package_warnings = package_warnings
    )
}

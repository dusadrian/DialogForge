# Run in a disposable R process: evaluation uses the real user workspace.
local({
    arguments <- commandArgs(trailingOnly = FALSE)
    script <- sub("^--file=", "", arguments[startsWith(arguments, "--file=")][[1L]])
    root <- dirname(dirname(normalizePath(script)))
    sources <- file.path(root, "src/runtime/providers/r/r-sources")
    runtime <- new.env(parent = globalenv())
    runtime$opts <- list()
    runtime$runtime_inspection_library <- Sys.getenv(
        "DIALOGFORGE_OUTPUT_LIBRARY", unset = file.path(
            root, "dist/r-runtime/native", paste(R.version$platform, getRversion(), sep = "-")
        )
    )
    runtime$app_env <- runtime
    runtime$trace <- function(message) invisible(NULL)
    runtime$dialog_record_traceback <- function() invisible(NULL)

    for (file in c(
        "runtimePrelude.R", "runtimeDiagnostics.R", "runtimeWarningCore.R", "runtimeDispatchCore.R",
        "runtimeOrderedCapturePrototype.R"
    )) {
        sys.source(file.path(sources, file), envir = runtime)
    }

    fixture_name <- "DF_console_expression_value"
    stopifnot(!exists(fixture_name, .GlobalEnv, inherits = FALSE))
    on.exit({
        if (exists(fixture_name, .GlobalEnv, inherits = FALSE)) {
            rm(list = fixture_name, envir = .GlobalEnv)
        }
    }, add = TRUE)

    previous_options <- options(width = 80L, digits = 7L)
    on.exit(options(previous_options), add = TRUE)

    # File connections replace only journal storage. The canonical ordered
    # capture still owns sinks, evaluation, messages and cleanup.
    ordered_backend <- list(
        open = function(path) {
            list(
                stdout = file(paste0(path, ".stdout"), "wt", encoding = "UTF-8"),
                stderr = file(paste0(path, ".stderr"), "wt", encoding = "UTF-8")
            )
        },
        seal = function(capture) {
            flush(capture$stdout)
            flush(capture$stderr)
            1
        },
        abort = function(capture) invisible(NULL)
    )

    capture_ordered_output <- function(code) {
        path <- tempfile("dialogforge-console-expression-")
        output_path <- paste0(path, ".stdout")
        error_path <- paste0(path, ".stderr")
        on.exit(unlink(c(output_path, error_path)), add = TRUE)

        result <- runtime$runtime_capture_ordered_input(code, path, ordered_backend)

        stopifnot(
            identical(result$capture_status, "sealed"),
            length(result$capture_errors) == 0L,
            identical(result$output_sequence, 1),
            length(readLines(error_path, warn = FALSE, encoding = "UTF-8")) == 0L
        )

        list(
            result = result,
            output = readLines(output_path, warn = FALSE, encoding = "UTF-8")
        )
    }

    fixtures <- list(
        list(
            name = "all top-level visible expressions",
            code = "1\n2\n3",
            expected = c("[1] 1", "[1] 2", "[1] 3")
        ),
        list(
            name = "semicolon expressions in one command",
            code = "1; 2; 3",
            expected = c("[1] 1", "[1] 2", "[1] 3")
        ),
        list(
            name = "invisible values and assignment",
            code = paste(
                "1", "invisible(2)", "DF_console_expression_value <- 3", "4",
                sep = "\n"
            ),
            expected = c("[1] 1", "[1] 4")
        ),
        list(
            name = "brace internals retain R visibility",
            code = "{\n    1\n    2\n}\n3",
            expected = c("[1] 2", "[1] 3")
        ),
        list(
            name = "multiline function call",
            code = "sum(\n    1,\n    2\n)\n4",
            expected = c("[1] 3", "[1] 4")
        ),
        list(
            name = "rivers class conversion",
            code = paste(
                "class(datasets::rivers)",
                "DF_console_expression_value <- type.convert(datasets::rivers, as.is = TRUE)",
                "class(DF_console_expression_value)",
                sep = "\n"
            ),
            expected = c('[1] "numeric"', '[1] "integer"')
        ),
        list(
            name = "language values print without re-evaluation",
            code = "quote(1 + 2)\nquote(a <- 3)",
            expected = c("1 + 2", "a <- 3")
        ),
        list(
            name = "comment and invisible-only input",
            code = "# no visible value\ninvisible(NULL)",
            expected = character(0)
        ),
        list(
            name = "error stops later expressions in the same command",
            code = '1\nstop("expected fixture failure")\n2',
            expected = "[1] 1",
            error = "expected fixture failure"
        )
    )

    for (fixture in fixtures) {
        ordinary <- runtime$runtime_capture_input(fixture$code, "console-expression-fixture")
        ordered <- capture_ordered_output(fixture$code)

        captures <- list(
            ordinary = list(result = ordinary, output = ordinary$output),
            ordered = ordered
        )

        for (host in names(captures)) {
            capture <- captures[[host]]

            if (!identical(capture$output, fixture$expected)) {
                stop(paste0(
                    "Unexpected ", host, " output for ", fixture$name, ":\n",
                    paste(capture$output, collapse = "\n"), "\nExpected:\n",
                    paste(fixture$expected, collapse = "\n")
                ))
            }

            if (is.null(fixture$error)) {
                stopifnot(isTRUE(capture$result$ok), !isTRUE(capture$result$interrupted))
            }
            else {
                stopifnot(
                    identical(capture$result$ok, FALSE),
                    identical(capture$result$error, fixture$error)
                )
            }
        }
    }

    stopifnot(identical(runtime$runtime_eval_code_text("1\n2"), "[1] 2"))

    cat(length(fixtures), "golden expression-printing cases passed through both capture paths.\n")
})

# Run separately: physical self-signalling must not affect the caller's R session.
local({
    arguments <- commandArgs(trailingOnly = FALSE)
    script <- sub("^--file=", "", arguments[startsWith(arguments, "--file=")][[1L]])
    root <- dirname(dirname(normalizePath(script)))
    runtime <- new.env(parent = baseenv())
    sys.source(file.path(root, "src/runtime/providers/r/r-sources/runtimeTransportCore.R"), runtime)
    protect <- runtime$runtime_run_control_request_action

    stopifnot(identical(protect(function() 13L), 13L))
    stopifnot(is.null(protect(function() NULL)))
    expected_error <- simpleError("original action failure")
    error <- tryCatch(protect(function() stop(expected_error)), error = identity)
    stopifnot(identical(error, expected_error))

    # The envelope must not turn an incomplete interrupted action into success.
    expected_interrupt <- structure(list(message = "fixture interrupt", call = NULL),
        class = c("interrupt", "condition"))
    interrupted <- tryCatch(
        protect(function() stop(expected_interrupt)),
        interrupt = identity
    )
    stopifnot(identical(interrupted, expected_interrupt))

    if (!identical(.Platform$OS.type, "windows")) {
        steps <- character(0)
        early <- protect(function() {
            steps <<- c(steps, "setup")
            tools::pskill(Sys.getpid(), 2L)
            steps <<- c(steps, "setup finished")
            value <- tryCatch(
                allowInterrupts({
                    Sys.sleep(0)
                    steps <<- c(steps, "user code")
                    "completed"
                }),
                interrupt = function(condition) "interrupted"
            )
            steps <<- c(steps, "response written", "drain announced")
            value
        })
        stopifnot(
            identical(early, "interrupted"),
            identical(steps, c("setup", "setup finished", "response written", "drain announced"))
        )

        # A late Stop cannot invalidate the already written response and fence.
        steps <- character(0)
        late <- protect(function() {
            steps <<- c(steps, "evaluation completed")
            tools::pskill(Sys.getpid(), 2L)
            steps <<- c(steps, "response written", "drain announced")
            "valid response"
        })
        stopifnot(
            identical(late, "valid response"),
            identical(steps, c("evaluation completed", "response written", "drain announced")),
            identical(protect(function() 13L), 13L)
        )

        # Prompt polling belongs to the still-active user evaluation, rather
        # than a new top-level delivery. Its Stop must reach the user's handler.
        sys.source(file.path(root, "src/runtime/providers/r/r-sources/runtimePromptCore.R"), runtime)
        runtime$`%||%` <- function(value, fallback) {
            if (is.null(value)) fallback else value
        }
        runtime$current_activity_id <- "outer-evaluation"
        runtime$active_prompt_id <- ""
        runtime$pending_prompt_reply <- NULL
        runtime$runtime_prompt_transport_read <- NULL
        runtime$trace <- function(...) invisible(NULL)
        runtime$emit_execution_phase_event <- function(...) invisible(NULL)
        runtime$runtime_event_identity <- function(...) list(id = "nested-prompt")
        runtime$emit_prompt_event <- function(...) list(id = "nested-prompt")
        runtime$safe <- function(expression) {
            tryCatch(expression, error = function(condition) NULL)
        }
        polls <- 0L
        runtime$process_once <- function() {
            polls <<- polls + 1L
            if (polls == 1L) {
                tools::pskill(Sys.getpid(), 2L)
            }
            else {
                runtime$pending_prompt_reply <- list(
                    parent_id = "outer-evaluation", prompt_id = "nested-prompt",
                    reply = "Stop was swallowed"
                )
            }
            invisible(NULL)
        }
        nested <- protect(function() {
            tryCatch(
                allowInterrupts(runtime$wait_for_prompt_reply("nested prompt: ")),
                interrupt = function(condition) "interrupted"
            )
        })
        stopifnot(
            identical(nested, "interrupted"), polls == 1L,
            identical(runtime$active_prompt_id, ""),
            is.null(runtime$pending_prompt_reply),
            identical(protect(function() 13L), 13L)
        )
        cat("Shared control envelope defers early SIGINT, preserves late delivery and interrupts nested prompt polling.\n")
    }
    else {
        cat("Shared control envelope value/error/interrupt cases passed; self-SIGINT is Unix-only.\n")
    }
})

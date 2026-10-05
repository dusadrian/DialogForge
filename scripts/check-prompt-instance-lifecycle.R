args <- commandArgs(trailingOnly = FALSE)
script <- sub("^--file=", "", args[startsWith(args, "--file=")][[1L]])
root <- dirname(dirname(normalizePath(script)))
sources <- file.path(root, "src/runtime/providers/r/r-sources")
fixture <- new.env(parent = baseenv())
fixture$`%||%` <- function(value, fallback) {
    if (is.null(value)) {
        return(fallback)
    }

    value
}

source_functions <- function(file, names) {
    for (expression in parse(file = file.path(sources, file))) {
        if (
            is.call(expression) &&
            identical(expression[[1L]], as.name("<-")) &&
            is.symbol(expression[[2L]]) &&
            is.element(as.character(expression[[2L]]), names)
        ) {
            eval(expression, envir = fixture)
        }
    }
}

source_functions("runtimeEventCore.R", c(
    "runtime_event_identity", "runtime_event_payload", "runtime_event_parent_id",
    "emit_prompt_event", "runtime_begin_transport_event_scope"
))
source_functions("runtimePromptCore.R", c(
    "runtime_prompt_pending_reply", "wait_for_prompt_reply",
    "runtime_prompt_transport_response"
))
source_functions("runtimeDispatchCore.R", "runtime_reply_prompt")
sys.source(file.path(sources, "runtimeTransportCore.R"), envir = fixture)

fixture$event_seq <- 0L
fixture$runtime_transport_event_nonce <- ""
fixture$live_events_enabled <- FALSE
fixture$runtime_diagnostics <- NULL
fixture$current_activity_id <- "activity"
fixture$active_prompt_id <- ""
fixture$pending_prompt_reply <- NULL
fixture$events <- character(0)
fixture$json_str <- function(value) paste0('"', value, '"')
fixture$json_bool <- function(value) {
    if (isTRUE(value)) {
        return("true")
    }

    "false"
}
fixture$runtime_diagnostic_count <- function(...) invisible(NULL)
fixture$runtime_diagnostic_mark <- function(...) invisible(NULL)
fixture$runtime_diagnostic_begin <- function(...) NULL
fixture$runtime_diagnostic_json <- function() NULL
fixture$flush_completion_queue <- function() invisible(NULL)
fixture$eval_method <- function(method, params) {
    stopifnot(identical(method, "reply_prompt"))
    fixture$runtime_reply_prompt(params)
}
fixture$trace <- function(...) invisible(NULL)
fixture$emit_execution_phase_event <- function(...) invisible(NULL)
fixture$safe <- function(value) value
fixture$push_event <- function(value) {
    fixture$events <- c(fixture$events, value)
}

previous_prompt <- ""
fixture$process_once <- function() {
    current_prompt <- fixture$active_prompt_id
    stopifnot(nzchar(current_prompt))
    if (nzchar(previous_prompt)) {
        stopifnot(!fixture$runtime_reply_prompt(list(
            parentId = "activity", promptId = previous_prompt, reply = "late"
        ))$ok)
    }
    stopifnot(fixture$runtime_reply_prompt(list(
        parentId = "activity", promptId = current_prompt, reply = ""
    ))$ok)
    stopifnot(!fixture$runtime_reply_prompt(list(
        parentId = "activity", promptId = current_prompt, reply = "duplicate"
    ))$ok)
    previous_prompt <<- current_prompt
}

stopifnot(identical(fixture$wait_for_prompt_reply("First: "), ""))
first_prompt <- previous_prompt
stopifnot(identical(fixture$active_prompt_id, ""))
stopifnot(is.null(fixture$pending_prompt_reply))
stopifnot(!fixture$runtime_reply_prompt(list(
    parentId = "activity", promptId = first_prompt, reply = "after completion"
))$ok)
stopifnot(identical(fixture$wait_for_prompt_reply(""), ""))
stopifnot(!identical(first_prompt, previous_prompt))
stopifnot(length(fixture$events) == 2L)
stopifnot(grepl('"prompt":""', fixture$events[[2L]], fixed = TRUE))
stopifnot(grepl(
    paste0('"id":"', previous_prompt, '"'), fixture$events[[2L]], fixed = TRUE
))

fixture$process_once <- function() stop("synthetic prompt exit")
failure <- tryCatch(
    fixture$wait_for_prompt_reply("Interrupted: "),
    error = function(error) conditionMessage(error)
)
stopifnot(identical(failure, "synthetic prompt exit"))
stopifnot(identical(fixture$active_prompt_id, ""))
stopifnot(is.null(fixture$pending_prompt_reply))

fixture$process_once <- function() {
    fixture$active_prompt_id <- "replacement-prompt"
    fixture$pending_prompt_reply <- list(
        parent_id = "replacement", prompt_id = "replacement-prompt", reply = "owned"
    )
    stop("retired prompt exit")
}
tryCatch(fixture$wait_for_prompt_reply("Retired: "), error = function(error) NULL)
stopifnot(identical(fixture$active_prompt_id, "replacement-prompt"))
stopifnot(identical(fixture$pending_prompt_reply$reply, "owned"))

fixture$pending_prompt_reply <- list(
    parent_id = "activity", prompt_id = "retired", reply = "stale"
)
stopifnot(is.null(fixture$runtime_prompt_pending_reply("activity", "current")))
stopifnot(is.null(fixture$pending_prompt_reply))

decoded <- fixture$runtime_transport_dedicated_params(
    '{"parentId":"activity","promptId":"prompt%2Fone","reply":""}'
)
stopifnot(identical(decoded$promptId, "prompt/one"))
stopifnot(identical(decoded$reply, ""))
legacy_parts <- rep("", 21L)
legacy_parts[[14L]] <- "activity"
legacy_parts[[21L]] <- "prompt%2Fone"
stopifnot(identical(
    fixture$runtime_transport_interactive_params(legacy_parts)$promptId,
    "prompt/one"
))
cat("Prompt instances: event identity, sequential/empty prompts, stale replies and exit cleanup.\n")

worker_responses <- character(0)
worker_attempt <- 0L
fixture$runtime_prompt_transport_read <- function(prompt_event) {
    worker_attempt <<- worker_attempt + 1L
    stopifnot(grepl(
        paste0('"id":"', fixture$active_prompt_id, '"'),
        prompt_event, fixed = TRUE
    ))
    parent <- if (worker_attempt == 1L) "foreign" else "activity"
    prompt <- if (worker_attempt == 2L) "retired" else fixture$active_prompt_id

    paste0(
        '{"prefix":"DMRUNTIME1","id":"worker-', worker_attempt, '",',
        '"method":"reply_prompt","parentId":"', parent, '",',
        '"promptId":"', prompt, '","reply":""}'
    )
}
fixture$runtime_prompt_transport_publish <- function(response) {
    worker_responses <<- c(worker_responses, response)
    if (!is.null(fixture$pending_prompt_reply)) {
        stopifnot(!fixture$runtime_reply_prompt(list(
            parentId = "activity", promptId = fixture$active_prompt_id,
            reply = "duplicate"
        ))$ok)
    }
}
fixture$process_once <- function() stop("Worker transport must not poll a native socket.")
stopifnot(identical(fixture$wait_for_prompt_reply("", password = TRUE), ""))
stopifnot(length(worker_responses) == 3L)
stopifnot(grepl('"ok":false', worker_responses[[1L]], fixed = TRUE))
stopifnot(grepl("prompt-activity-mismatch", worker_responses[[1L]], fixed = TRUE))
stopifnot(grepl("prompt-instance-mismatch", worker_responses[[2L]], fixed = TRUE))
stopifnot(grepl('"ok":true', worker_responses[[3L]], fixed = TRUE))
stopifnot(identical(fixture$active_prompt_id, ""))
stopifnot(is.null(fixture$pending_prompt_reply))
stopifnot(grepl('"password":true', tail(fixture$events, 1L), fixed = TRUE))
stopifnot(grepl(
    "invalid-prompt-transport-request",
    fixture$runtime_prompt_transport_response(
        '{"prefix":"DMRUNTIME1","id":"invalid","method":"execute_input"}'
    ), fixed = TRUE
))
packet <- '{"prefix":"DMRUNTIME1","id":"worker","method":"reply_prompt"}'
stopifnot(!fixture$runtime_transport_validate_json_request(packet))
stopifnot(fixture$runtime_transport_validate_json_request(packet, require_auth = FALSE))
stopifnot(!fixture$runtime_transport_validate_json_request(
    '{"prefix":"DMRUNTIME1","id":"worker","id":"duplicate","method":"reply_prompt"}',
    require_auth = FALSE
))

fixture$runtime_prompt_transport_read <- function(prompt_event) stop("worker input failed")
failure <- tryCatch(fixture$wait_for_prompt_reply("Failure:"),
    error = function(error) conditionMessage(error))
stopifnot(identical(failure, "worker input failed"))
stopifnot(identical(fixture$active_prompt_id, ""))
stopifnot(is.null(fixture$pending_prompt_reply))
cat("The same R prompt waiter validates native and worker replies and retires failed waits.\n")

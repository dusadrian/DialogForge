args <- commandArgs(trailingOnly = FALSE)
script <- sub("^--file=", "", args[startsWith(args, "--file=")][[1L]])
root <- dirname(dirname(normalizePath(script)))
expressions <- parse(file = file.path(root, "src/runtime/providers/r/r-sources/runtimeControlBootstrap.R"))
fixture <- new.env(parent = baseenv())
for (expression in expressions) {
    if (is.call(expression) && identical(expression[[1L]], as.name("<-")) &&
        is.symbol(expression[[2L]]) && is.element(as.character(expression[[2L]]),
            c("runtime_read_control_request", "process_once"))) {
        eval(expression, envir = fixture)
    }
}
closed <- list()
fixture$close <- function(connection) {
    closed[[length(closed) + 1L]] <<- connection
}
fixture$safe <- function(value) tryCatch(value, error = function(error) NULL)
traces <- character(0)
fixture$trace <- function(message) {
    traces <<- c(traces, message)
    invisible(NULL)
}
fixture$runtime_close_client <- function(dedicated) {
    fixture$close(fixture$client)
    fixture$client <- NULL
}
fixture$max_payload <- 512L
fixture$runtime_control_read_active <- FALSE
timeout_calls <- list()
fixture$socketTimeout <- function(connection, timeout) {
    timeout_calls[[length(timeout_calls) + 1L]] <<- list(connection, timeout)
    if (identical(timeout, 1)) 60L else 1L
}
for (status in c("truncated", "too_large", "invalid_nul", "closed_or_failed", "deadline",
    "error", "interrupt", "bad-payload", "private-command-token-do-not-log")) {
    fixture$client <- 1L
    before <- length(closed)
    timeout_calls <- list()
    traces <- character(0)
    fixture$runtime_bounded_input_config <- list(reader = function(connection, limit) {
        stopifnot(identical(connection, 1L), identical(limit, 512L))
        stopifnot(fixture$runtime_control_read_active)
        # A nested process callback cannot read or dispatch while input is owned.
        stopifnot(is.null(fixture$process_once()))
        if (identical(status, "error")) {
            stop("Synthetic read failure")
        }
        if (identical(status, "interrupt")) {
            stop(structure(list(message = "Synthetic interruption"), class = c("interrupt", "condition")))
        }
        if (identical(status, "bad-payload")) {
            return(list(status = "line", bytes = "not raw"))
        }
        list(status = status, bytes = raw(0))
    })
    result <- fixture$runtime_read_control_request(TRUE)
    stopifnot(!identical(result$status, "line"), is.null(fixture$client))
    stopifnot(length(closed) == before + 1L, !fixture$runtime_control_read_active)
    stopifnot(identical(timeout_calls, list(list(1L, 1), list(1L, 60L))))
    expected_reason <- switch(status,
        error = "read_exception", interrupt = "read_interrupted",
        `bad-payload` = "invalid_frame", `private-command-token-do-not-log` = "invalid_frame",
        status
    )
    stopifnot(identical(result$frame_status, expected_reason))
    stopifnot(identical(traces, paste0(
        "client:input retired status=", result$status, " frame=", expected_reason
    )))
}
fixture$client <- 1L
fixture$runtime_bounded_input_config <- list(reader = function(connection, limit) {
    list(status = "line", bytes = charToRaw("complete"))
})
result <- fixture$runtime_read_control_request(TRUE)
stopifnot(identical(result$payload, "complete"), identical(fixture$client, 1L))
fixture$runtime_bounded_input_config <- list(reader = function(connection, limit) {
    fixture$client <- 2L
    list(status = "line", bytes = charToRaw("retired input"))
})
result <- fixture$runtime_read_control_request(TRUE)
stopifnot(identical(result$status, "retired"), identical(fixture$client, 2L))
stopifnot(identical(closed[[length(closed)]], 1L), !fixture$runtime_control_read_active)
fixture$runtime_bounded_input_config <- NULL
fixture$runtime_native_frame_reader <- function(connection, limit) {
    list(status = "line", bytes = charToRaw("default frame"))
}
result <- fixture$runtime_read_control_request(TRUE)
stopifnot(identical(result$payload, "default frame"), identical(fixture$client, 2L))
for (mode in c("truncated", "invalid_nul", "too_large", "deadline", "error", "interrupt", "closed_or_failed")) {
    fixture$client <- 1L
    timeout_calls <- list()
    before <- length(closed)
    fixture$runtime_native_frame_reader <- function(connection, limit) {
        stopifnot(identical(connection, 1L), identical(limit, 512L))
        if (identical(mode, "error")) {
            stop("Synthetic default read error")
        }
        if (identical(mode, "interrupt")) {
            stop(structure(list(message = "Synthetic interruption"), class = c("interrupt", "condition")))
        }
        list(status = mode, bytes = raw(0))
    }
    result <- fixture$runtime_read_control_request(TRUE)
    stopifnot(!identical(result$status, "line"), is.null(fixture$client))
    stopifnot(length(closed) == before + 1L, !fixture$runtime_control_read_active)
    stopifnot(identical(timeout_calls, list(list(1L, 1), list(1L, 60L))))
}
fixture$client <- 2L

fixture$runtime_accept_client <- function(dedicated) TRUE
fixture$runtime_connection_ready <- function(value) isTRUE(value[[1L]])
fixture$runtime_bounded_input_config <- list()
reads <- 0L
fixture$runtime_read_control_request <- function(dedicated) {
    reads <<- reads + 1L
    list(status = "closed")
}
for (kind in c("dedicated", "interactive")) {
    fixture$session_kind <- kind
    fixture$socketSelect <- function(connections, timeout) {
        stopifnot(identical(connections, list(2L)))
        stopifnot(identical(timeout, if (identical(kind, "dedicated")) 1 else 0.02))
        FALSE
    }
    before <- length(closed)
    for (iteration in seq_len(3L)) {
        fixture$process_once()
    }
    stopifnot(reads == 0L, identical(fixture$client, 2L))
    stopifnot(length(closed) == before)

    fixture$socketSelect <- function(connections, timeout) TRUE
    fixture$process_once()
    stopifnot(reads == 1L)
    reads <- 0L
}
cat("Bounded input hookup cases passed; native socket/startup acceptance remains separate.\n")

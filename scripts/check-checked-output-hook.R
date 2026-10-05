args <- commandArgs(trailingOnly = FALSE)
script <- sub("^--file=", "", args[startsWith(args, "--file=")][[1L]])
root <- dirname(dirname(normalizePath(script)))
fixture <- new.env(parent = baseenv())
for (file in c("runtimeControlBootstrap.R", "runtimeEventCore.R")) {
    for (expression in parse(file = file.path(root, "src/runtime/providers/r/r-sources", file))) {
        if (is.call(expression) && identical(expression[[1L]], as.name("<-")) &&
            is.symbol(expression[[2L]]) && is.element(as.character(expression[[2L]]),
                c("runtime_write_payload", "push_event"))) {
            eval(expression, envir = fixture)
        }
    }
}
fixture$`%||%` <- function(value, fallback) if (is.null(value)) fallback else value
fixture$safe <- function(value) tryCatch(value, error = function(error) NULL)
fixture$runtime_diagnostics <- NULL
fixture$runtime_collected_events <- NULL
fixture$live_events_enabled <- TRUE
fixture$runtime_live_event_transport_write <- fixture$runtime_write_payload
fixture$session_kind <- "dedicated"
closed <- list()
file_events <- character(0)
fixture$close <- function(connection) closed[[length(closed) + 1L]] <<- connection
timeout_calls <- list()
fixture$socketTimeout <- function(connection, timeout) {
    timeout_calls[[length(timeout_calls) + 1L]] <<- list(connection, timeout)
    if (identical(timeout, 1)) 60L else 1L
}
fixture$runtime_close_client <- function(dedicated) {
    fixture$close(fixture$client)
    fixture$client <- NULL
}
fixture$write_event <- function(line) file_events <<- c(file_events, line)
for (mode in c("short", "error", "interrupt", "retired", "success")) {
    fixture$client <- 1L
    fixture$runtime_transport_write_failed <- FALSE
    calls <- 0L
    timeout_calls <- list()
    before <- length(closed)
    fixture$runtime_native_frame_writer <- function(connection, payload) {
        calls <<- calls + 1L
        stopifnot(identical(connection, 1L), identical(payload, "frame"))
        if (identical(mode, "error")) stop("Synthetic write failure")
        if (identical(mode, "interrupt")) {
            stop(structure(list(message = "Synthetic interruption"), class = c("interrupt", "condition")))
        }
        if (identical(mode, "retired")) fixture$client <- 2L
        identical(mode, "success")
    }
    result <- fixture$push_event("frame")
    stopifnot(calls == 1L, identical(result, identical(mode, "success")))
    stopifnot(identical(timeout_calls, list(list(1L, 1), list(1L, 60L))))
    if (is.element(mode, c("short", "error", "interrupt"))) {
        stopifnot(is.null(fixture$client), fixture$runtime_transport_write_failed)
        fixture$push_event("later event")
        stopifnot(calls == 1L, !length(file_events))
    }
    if (identical(mode, "retired")) {
        stopifnot(identical(fixture$client, 2L), identical(closed[[length(closed)]], 1L))
    }
    if (identical(mode, "success")) {
        stopifnot(identical(fixture$client, 1L), length(closed) == before)
    }
}
cat("Checked output hookup cases passed; real short-write/socket/Interrupt acceptance remains separate.\n")

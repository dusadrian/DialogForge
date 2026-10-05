args <- commandArgs(trailingOnly = FALSE)
script <- sub("^--file=", "", args[startsWith(args, "--file=")][[1L]])
root <- dirname(dirname(normalizePath(script)))
fixture <- new.env(parent = baseenv())
fixture$`%||%` <- function(value, fallback) {
    if (is.null(value)) {
        return(fallback)
    }
    value
}
for (expression in parse(file.path(
    root, "src/runtime/providers/r/r-sources/runtimeEventCore.R"
))) {
    if (
        is.call(expression) && identical(expression[[1L]], as.name("<-")) &&
        identical(expression[[2L]], as.name("push_event"))
    ) {
        eval(expression, envir = fixture)
    }
}

fixture$runtime_diagnostics <- NULL
fixture$runtime_transport_write_failed <- FALSE
fixture$runtime_collected_events <- character(0)
fixture$live_events_enabled <- TRUE
delivered <- character(0)
fixture$runtime_live_event_transport_write <- function(event) {
    delivered <<- c(delivered, event)
    invisible(NULL)
}
fixture$write_event <- function(event) stop("Collected events must not enter the fallback file")
event <- '{"type":"stream","id":"choices"}'
fixture$push_event(event)
stopifnot(identical(delivered, event))
stopifnot(identical(fixture$runtime_collected_events, event))

fixture$live_events_enabled <- FALSE
fixture$push_event(event)
stopifnot(length(delivered) == 1L)
stopifnot(length(fixture$runtime_collected_events) == 2L)
fixture$live_events_enabled <- TRUE
fixture$runtime_live_event_transport_write <- NULL
fixture$push_event(event)
stopifnot(length(delivered) == 1L)
stopifnot(length(fixture$runtime_collected_events) == 3L)
fixture$runtime_live_event_transport_write <- function(event) stop("physical write failed")
failure <- tryCatch(fixture$push_event(event), error = conditionMessage)
stopifnot(identical(failure, "physical write failed"))
stopifnot(length(fixture$runtime_collected_events) == 4L)
cat("Shared events retain response replay, live delivery and physical write failures.\n")

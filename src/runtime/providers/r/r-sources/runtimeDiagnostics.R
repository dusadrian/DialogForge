runtime_diagnostics <- NULL


runtime_diagnostic_mark <- function(phase, count = 0) {
    state <- runtime_diagnostics

    if (is.null(state)) {
        return(invisible(NULL))
    }

    if (length(state$entries) >= 128L) {
        state$dropped <- state$dropped + 1L
        return(invisible(NULL))
    }

    state$entries[[length(state$entries) + 1L]] <- list(
        phase = phase,
        ms = unname(proc.time()[["elapsed"]]) * 1000,
        count = count
    )
    invisible(NULL)
}


runtime_diagnostic_count <- function(name, count = 1) {
    state <- runtime_diagnostics

    if (!is.null(state)) {
        state$counts[[name]] <- (state$counts[[name]] %||% 0) + count
    }

    invisible(NULL)
}


runtime_diagnostic_begin <- function(params) {
    previous <- runtime_diagnostics
    runtime_diagnostics <<- NULL

    if (nzchar(as.character(params$diagnosticSession %||% ""))) {
        state <- new.env(parent = emptyenv())
        state$entries <- list()
        state$counts <- list()
        state$dropped <- 0L
        runtime_diagnostics <<- state
        runtime_diagnostic_mark("request.dispatched")
    }

    previous
}


runtime_diagnostic_json <- function() {
    state <- runtime_diagnostics

    if (is.null(state)) {
        return(NULL)
    }

    runtime_diagnostic_mark("request.finished")

    entries <- state$entries

    for (name in names(state$counts)) {
        entries[[length(entries) + 1L]] <- list(
            phase = paste0("count.", name),
            ms = unname(proc.time()[["elapsed"]]) * 1000,
            count = state$counts[[name]]
        )
    }
    entries[[length(entries) + 1L]] <- list(
        phase = "trace.dropped",
        ms = unname(proc.time()[["elapsed"]]) * 1000,
        count = state$dropped
    )

    paste0("[", paste(vapply(entries, function(entry) {
        paste0(
            "{\"phase\":", json_str(entry$phase),
            ",\"ms\":", json_num(entry$ms),
            ",\"count\":", json_num(entry$count), "}"
        )
    }, character(1)), collapse = ","), "]")
}

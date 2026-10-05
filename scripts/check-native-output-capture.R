library_path <- Sys.getenv("DIALOGFORGE_OUTPUT_LIBRARY")
if (!nzchar(library_path)) {
    stop("Set DIALOGFORGE_OUTPUT_LIBRARY to the isolated prototype library.")
}
namespace <- loadNamespace("dialogforgeoutput", lib.loc = library_path)
open_capture <- get("open_output_capture", envir = namespace)
seal_capture <- get("seal_output_capture", envir = namespace)
abort_capture <- get("abort_output_capture", envir = namespace)

read_frames <- function(path) {
    connection <- file(path, "rb")
    on.exit(close(connection))
    stopifnot(identical(rawToChar(readBin(connection, "raw", 8L)), "DFOUT001"))
    records <- list()

    repeat {
        header <- readBin(connection, "raw", 13L)
        if (!length(header)) {
            break
        }
        stopifnot(length(header) == 13L)
        values <- as.integer(header)
        sequence <- sum(values[2:9] * 256^(7:0))
        payload_length <- sum(values[10:13] * 256^(3:0))
        bytes <- readBin(connection, "raw", payload_length)
        stopifnot(length(bytes) == payload_length)
        records[[length(records) + 1L]] <- list(
            channel = values[[1L]], sequence = sequence, bytes = bytes
        )
    }

    records
}

rejects <- function(action) inherits(tryCatch(action(), error = identity), "error")

# Each fixture keeps its journal for inspection; no user files are overwritten.
directory <- tempfile("dialogforge-output-cases-")
dir.create(directory, mode = "0700")
path <- file.path(directory, "interleaved.bin")
capture <- open_capture(path)
sink(capture$stdout)
sink(capture$stderr, type = "message")
tryCatch({
    cat("first\n")
    before_finish <- read_frames(path)
    stopifnot(length(before_finish) > 0L)
    stopifnot(identical(rawToChar(do.call(c, lapply(before_finish, `[[`, "bytes"))), "first\n"))
    cat("middle\n", file = stderr())
    cat("last\n\n")
}, finally = {
    sink(type = "message")
    sink()
})
seal_capture(capture)
seal_capture(capture)
close(capture$stdout)
close(capture$stderr)
records <- read_frames(path)
stopifnot(identical(vapply(records, `[[`, 0, "sequence"), as.numeric(seq_along(records))))
stopifnot(tail(records, 1L)[[1L]]$channel == 0L)
stopifnot(!length(tail(records, 1L)[[1L]]$bytes))
channels <- vapply(records[-length(records)], `[[`, 0L, "channel")
stopifnot(identical(rle(channels)$values, c(1L, 2L, 1L)))
stopifnot(identical(rawToChar(do.call(c, lapply(records, `[[`, "bytes"))), "first\nmiddle\nlast\n\n"))
stopifnot(rejects(function() open_capture(path))) # Exclusive, no overwrite.
stopifnot(identical(rawToChar(do.call(c, lapply(read_frames(path), `[[`, "bytes"))), "first\nmiddle\nlast\n\n"))

warning_case <- function(level) {
    path <- file.path(directory, paste0("warning-", level, ".bin"))
    capture <- open_capture(path)
    previous <- options(warn = level)
    on.exit(options(previous), add = TRUE)
    sink(capture$stdout)
    sink(capture$stderr, type = "message")
    result <- tryCatch({
        cat("before\n")
        warning("capture warning", call. = FALSE)
        cat("after\n")
        TRUE
    }, error = identity, finally = {
        sink(type = "message")
        sink()
    })
    seal_capture(capture)
    close(capture$stdout)
    close(capture$stderr)
    records <- read_frames(path)
    text <- rawToChar(do.call(c, lapply(records, `[[`, "bytes")))
    if (level == -1L) {
        stopifnot(isTRUE(result), identical(text, "before\nafter\n"))
    }
    else if (level == 1L) {
        stopifnot(isTRUE(result), grepl("capture warning", text, fixed = TRUE))
        stopifnot(grepl("before\n", text, fixed = TRUE), endsWith(text, "after\n"))
        stopifnot(any(vapply(records, `[[`, 0L, "channel") == 2L))
    }
    else if (level == 2L) {
        stopifnot(inherits(result, "error"), identical(text, "before\n"))
    }
}
for (level in c(-1L, 1L, 2L)) {
    warning_case(level)
}

path <- file.path(directory, "sealed.bin")
capture <- open_capture(path)
seal_capture(capture)
stopifnot(rejects(function() writeLines("late", capture$stdout)))
close(capture$stdout)
close(capture$stderr)

path <- file.path(directory, "chunks.bin")
capture <- open_capture(path)
writeLines(strrep("x", 150000L), capture$stdout, sep = "")
seal_capture(capture)
close(capture$stdout)
close(capture$stderr)
records <- read_frames(path)
stopifnot(all(vapply(records, function(record) length(record$bytes) <= 65536L, TRUE)))
stopifnot(sum(vapply(records, function(record) length(record$bytes), 0L)) == 150000L)

args <- commandArgs(trailingOnly = FALSE)
script <- sub("^--file=", "", args[startsWith(args, "--file=")][[1L]])
root <- dirname(dirname(normalizePath(script)))
sources <- file.path(root, "src/runtime/providers/r/r-sources")
fixture <- new.env(parent = baseenv())
fixture$`%||%` <- function(value, fallback) if (is.null(value)) fallback else value
sys.source(file.path(sources, "runtimeWarningCore.R"), envir = fixture)
sys.source(file.path(sources, "runtimeOrderedCapturePrototype.R"), envir = fixture)
fixture$runtime_print_visible_value <- function(value) {
    do.call(base::print, list(value), quote = TRUE, envir = .GlobalEnv)
}
tracebacks <- 0L
fixture$app_env <- new.env(parent = baseenv())
fixture$app_env$dialog_record_traceback <- function() {
    tracebacks <<- tracebacks + 1L
}
backend <- list(open = open_capture, seal = seal_capture, abort = abort_capture)
case_number <- 0L
evaluate_case <- function(code, level = 0L, selected_backend = backend) {
    case_number <<- case_number + 1L
    path <- file.path(directory, paste0("evaluation-", case_number, ".bin"))
    previous <- options(warn = level)
    on.exit(options(previous))
    output_depth <- sink.number(type = "output")
    message_number <- sink.number(type = "message")
    result <- fixture$runtime_capture_ordered_input(code, path, selected_backend)
    stopifnot(sink.number(type = "output") == output_depth)
    stopifnot(sink.number(type = "message") == message_number)
    stopifnot(!fixture$runtime_ordered_capture_active)
    records <- read_frames(path)
    bytes <- if (length(records)) do.call(c, lapply(records, `[[`, "bytes")) else raw(0)
    list(result = result, records = records,
        text = rawToChar(bytes))
}

deferred <- evaluate_case('cat("before\\n"); warning("deferred", call. = FALSE); cat("after\\n")')
stopifnot(deferred$result$ok, identical(deferred$result$capture_status, "sealed"))
stopifnot(startsWith(deferred$text, "before\nafter\n"))
stopifnot(grepl("deferred", deferred$text, fixed = TRUE))
following <- evaluate_case('cat("next\\n")')
stopifnot(identical(following$text, "next\n")) # No queue spill into the next activity.
immediate <- evaluate_case('cat("before\\n"); warning("immediate", call. = FALSE); cat("after\\n")', 1L)
stopifnot(startsWith(immediate$text, "before\n"), endsWith(immediate$text, "after\n"))
forced <- evaluate_case('cat("before\\n"); warning("forced", immediate. = TRUE, call. = FALSE); cat("after\\n")')
stopifnot(startsWith(forced$text, "before\n"), endsWith(forced$text, "after\n"))
stopifnot(grepl("forced", forced$text, fixed = TRUE))
suppressed <- evaluate_case('warning("hidden", call. = FALSE); cat("kept\\n")', -1L)
stopifnot(identical(suppressed$text, "kept\n"))
converted <- evaluate_case('warning("fatal", call. = FALSE); cat("unreachable\\n")', 2L)
stopifnot(!converted$result$ok, grepl("fatal", converted$result$error, fixed = TRUE))
stopifnot(!grepl("unreachable", converted$text, fixed = TRUE))
stopifnot(tracebacks == 1L)
failed <- evaluate_case('cat("partial\\n"); warning("before error", call. = FALSE); stop("evaluation failed")')
stopifnot(!failed$result$ok, identical(failed$result$capture_status, "sealed"))
stopifnot(grepl("before error", failed$text, fixed = TRUE))
stopifnot(tracebacks == 2L)
interrupted <- evaluate_case('stop(structure(list(message = "synthetic interrupt", call = NULL), class = c("interrupt", "condition")))')
stopifnot(interrupted$result$interrupted, identical(interrupted$result$capture_status, "sealed"))
stopifnot("Interrupt is not recorded as an evaluation error" = tracebacks == 2L)
visible <- evaluate_case('42L')
stopifnot(grepl("42", visible$text, fixed = TRUE))
messages <- evaluate_case('cat("first\\n"); message("middle"); cat("last\\n")')
stopifnot(identical(messages$text, "first\nmiddle\nlast\n"))
for (expression in parse(file = file.path(sources, "runtimeEventCore.R"))) {
    if (
        is.call(expression) && identical(expression[[1L]], as.name("<-")) &&
        is.element(as.character(expression[[2L]]), c("emit_stream_event", "runtime_event_parent_id"))
    ) {
        eval(expression, envir = fixture)
    }
}
fixture$current_activity_id <- "output-fixture"
stream_events <- list()
fixture$runtime_event_payload <- function(type, fields, parent_id) {
    list(type = type, fields = fields, parent_id = parent_id)
}
fixture$json_str <- function(value) encodeString(value, quote = '"')
fixture$push_event <- function(event) {
    stream_events[[length(stream_events) + 1L]] <<- event
}
assign("DF_output_emit_fixture", fixture, envir = .GlobalEnv)
generated <- evaluate_case(paste0(
    'cat("before\\n"); ',
    'DF_output_emit_fixture$emit_stream_event("choices\\n"); ',
    'DF_output_emit_fixture$emit_stream_event("diagnostic\\n", "stderr", "output-fixture"); ',
    'cat("after\\n")'
))
stopifnot(
    generated$result$ok,
    identical(generated$text, "before\nchoices\ndiagnostic\nafter\n"),
    !length(stream_events),
    identical(rle(vapply(generated$records[-length(generated$records)], `[[`, 0L, "channel"))$values,
        c(1L, 2L, 1L))
)
foreign <- evaluate_case('DF_output_emit_fixture$emit_stream_event("foreign", "stdout", "old-activity")')
stopifnot(!foreign$result$ok, !grepl("foreign", foreign$text, fixed = TRUE))
fixture$emit_stream_event("ordinary", "stdout", "output-fixture")
stopifnot(length(stream_events) == 1L, identical(stream_events[[1L]]$type, "stream"))
rm("DF_output_emit_fixture", envir = .GlobalEnv)
package_warning <- evaluate_case('warning("\'package:example\' may not be available when loading", call. = FALSE)')
stopifnot(identical(package_warning$result$package_warnings,
    "'package:example' may not be available when loading"))
quiet_package <- evaluate_case('warning("\'package:example\' may not be available when loading", call. = FALSE)', -1L)
stopifnot(!length(quiet_package$result$package_warnings))

for (expression in parse(file = file.path(sources, "runtimeDispatchCore.R"))) {
    if (is.call(expression) && identical(expression[[1L]], as.name("<-")) &&
        identical(expression[[2L]], as.name("runtime_emit_package_warning_diagnostic"))) {
        eval(expression, envir = fixture)
    }
}
diagnostics <- list()
diagnostic_traces <- character(0)
fixture$package_loading_warning_diagnostics <- function(code, warning) {
    paste0("diagnostic for ", code, "\n", warning)
}
fixture$emit_stream_event <- function(text, channel, parent_id) {
    diagnostics[[length(diagnostics) + 1L]] <<- list(text, channel, parent_id)
}
fixture$trace <- function(text) diagnostic_traces <<- c(diagnostic_traces, text)
fixture$runtime_emit_package_warning_diagnostic(character(0), "none", "activity")
stopifnot(!length(diagnostics))
fixture$runtime_emit_package_warning_diagnostic(
    c("first package warning", "second package warning"), "save.image()", "activity"
)
stopifnot(length(diagnostics) == 1L)
stopifnot(identical(diagnostics[[1L]], list(
    "diagnostic for save.image()\nfirst package warning", "stderr", "activity"
)))
stopifnot(identical(diagnostic_traces, "diagnostic for save.image() | first package warning"))

restoration_case <- function() {
    outer_output <- character(0)
    outer_messages <- character(0)
    output_connection <- textConnection("outer_output", "w", local = TRUE)
    message_connection <- textConnection("outer_messages", "w", local = TRUE)
    sink(output_connection)
    sink(message_connection, type = "message")
    on.exit({
        sink(type = "message")
        sink()
        close(output_connection)
        close(message_connection)
    })
    evaluate_case('cat("owned\\n"); stop("owned error")')
    cat("outer output\n")
    cat("outer message\n", file = stderr())
    stopifnot(identical(outer_output, "outer output"))
    stopifnot(identical(outer_messages, "outer message"))
}
restoration_case()
balanced <- evaluate_case('local({ hidden <- character(0); connection <- textConnection("hidden", "w", local = TRUE); sink(connection); on.exit({ sink(); close(connection) }); cat("redirected\\n"); stop("nested error") })')
stopifnot(!balanced$result$ok, identical(balanced$result$capture_status, "sealed"))
stopifnot(!grepl("redirected", balanced$text, fixed = TRUE))

broken_backend <- backend
broken_backend$seal <- function(capture) stop("synthetic seal failure")
broken <- evaluate_case('cat("kept\\n")', selected_backend = broken_backend)
stopifnot(identical(broken$result$capture_status, "failed"))
stopifnot(!any(vapply(broken$records, `[[`, 0L, "channel") == 0L))
removed <- evaluate_case('sink(); invisible(NULL)')
stopifnot(identical(removed$result$capture_status, "failed"))
stopifnot(!any(vapply(removed$records, `[[`, 0L, "channel") == 0L))

cat("Native capture/evaluation prototype cases passed; journals retained in ", directory, "\n", sep = "")

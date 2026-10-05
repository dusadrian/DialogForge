root <- Sys.getenv("DIALOGFORGE_TEST_SOURCE_ROOT", unset = "")
if (!nzchar(root)) {
    args <- commandArgs(trailingOnly = FALSE)
    script <- sub("^--file=", "", args[startsWith(args, "--file=")][[1L]])
    root <- dirname(dirname(normalizePath(script)))
}
fixture <- new.env(parent = baseenv())
sys.source(file.path(
    root, "src/runtime/providers/r/r-sources/runtimeOutputJournalPrototype.R"
), envir = fixture)

rejects <- function(action) {
    inherits(tryCatch(action(), error = identity), "error")
}

records <- list()
journal <- fixture$runtime_create_output_journal("session", "activity", function(record) {
    records[[length(records) + 1L]] <<- record
    TRUE
})
journal$append("first", "stdout")
stopifnot(length(records) == 1L) # Published before evaluation/seal, not batched.
journal$append("error\n", "stderr")
journal$append("\nsecond\n\n", "stdout")
journal$append("Warning message:\nexample", "warning")
journal$append("", "stdout")
stopifnot(length(records) == 4L)
stopifnot(identical(vapply(records, `[[`, "", "channel"), c(
    "stdout", "stderr", "stdout", "warning"
)))
stopifnot(identical(records[[3L]]$text, "\nsecond\n\n"))
stopifnot(all(vapply(records, function(record) {
    identical(record$session_id, "session") && identical(record$parent_id, "activity")
}, TRUE)))
journal$seal()
journal$seal()
stopifnot(length(records) == 5L)
stopifnot(identical(records[[5L]]$type, "output_end"))
stopifnot(identical(records[[5L]]$last_output_seq, 4))
stopifnot(identical(vapply(records, `[[`, 0, "output_seq"), as.numeric(1:5)))
stopifnot(rejects(function() journal$append("late", "stdout")))

empty_records <- list()
empty <- fixture$runtime_create_output_journal("session", "empty", function(record) {
    empty_records[[length(empty_records) + 1L]] <<- record
    TRUE
})
empty$seal()
empty$seal()
stopifnot(
    length(empty_records) == 1L,
    identical(empty_records[[1L]]$type, "output_end"),
    identical(empty_records[[1L]]$last_output_seq, 0),
    identical(empty_records[[1L]]$output_seq, 1),
    identical(empty$snapshot()$state, "sealed")
)

for (publisher in list(function(record) FALSE, function(record) stop("failed end"))) {
    rejected_end <- fixture$runtime_create_output_journal("session", "end", publisher)
    stopifnot(
        rejects(function() rejected_end$seal()),
        identical(rejected_end$snapshot()$state, "failed"),
        identical(rejected_end$snapshot()$sequence, 1),
        rejects(function() rejected_end$seal()),
        rejects(function() rejected_end$append("no replay", "stdout"))
    )
}

for (publisher in list(function(record) FALSE, function(record) stop("failed"))) {
    failed <- fixture$runtime_create_output_journal("session", "activity", publisher)
    stopifnot(rejects(function() failed$append("unconfirmed", "stdout")))
    stopifnot(identical(failed$snapshot()$state, "failed"))
    stopifnot(identical(failed$snapshot()$sequence, 1))
    stopifnot(rejects(function() failed$seal()))
    stopifnot(rejects(function() failed$append("no replay", "stdout")))
}

recursive <- fixture$runtime_create_output_journal("session", "recursive", function(record) {
    recursive$append("recursive", "stderr")
    TRUE
})
stopifnot(rejects(function() recursive$append("original", "stdout")))
stopifnot(identical(recursive$snapshot()$state, "failed"))

retired <- fixture$runtime_create_output_journal("session", "retired", function(record) {
    retired$retire()
    TRUE
})
stopifnot(rejects(function() retired$append("in flight", "stdout")))
stopifnot(identical(retired$snapshot()$state, "retired"))
stopifnot(rejects(function() retired$seal()))

other <- fixture$runtime_create_output_journal("replacement", "activity", function(record) TRUE)
stopifnot(identical(other$snapshot()$sequence, 0))
stopifnot(rejects(function() other$append(NA_character_, "stdout")))
stopifnot(rejects(function() other$append("text", "unknown")))
stopifnot(identical(other$snapshot()$sequence, 0))
other$retire()
stopifnot(rejects(function() other$append("", "stdout")))
stopifnot(rejects(function() fixture$runtime_create_output_journal("", "activity", identity)))

cat("Output journal prototype cases passed. Capture/transport acceptance is separate.\n")

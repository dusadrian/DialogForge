args <- commandArgs(trailingOnly = FALSE)
script <- sub("^--file=", "", args[startsWith(args, "--file=")][[1L]])
root <- dirname(dirname(normalizePath(script)))
library_path <- Sys.getenv("DIALOGFORGE_TRANSPORT_LIBRARY")
if (!nzchar(library_path)) {
    stop("Set DIALOGFORGE_TRANSPORT_LIBRARY to the isolated prototype library.")
}
loadNamespace("dialogforgeruntime", lib.loc = library_path)
read_request <- getExportedValue("dialogforgeruntime", "read_bounded_runtime_request")

with_binary_input <- function(bytes, check) {
    path <- tempfile("dialogforge-bounded-input-")
    on.exit(unlink(path), add = TRUE)
    writeBin(bytes, path)
    connection <- file(path, open = "rb", blocking = TRUE)
    on.exit(close(connection), add = TRUE)
    check(connection)
}

with_binary_input(charToRaw("first\r\nsecond\n"), function(connection) {
    first <- read_request(connection, 512L)
    second <- read_request(connection, 512L)
    end <- read_request(connection, 512L)
    stopifnot(identical(first$status, "line"), identical(rawToChar(first$bytes), "first"))
    stopifnot(identical(second$status, "line"), identical(rawToChar(second$bytes), "second"))
    stopifnot(identical(end$status, "closed_or_failed"), !length(end$bytes))
})
for (ending in c("\n", "\r\n")) {
    with_binary_input(charToRaw(paste0(strrep("x", 512), ending)), function(connection) {
        result <- read_request(connection, 512L)
        stopifnot(identical(result$status, "line"), length(result$bytes) == 512L)
    })
}
for (case in c("too_large", "truncated", "invalid_nul")) {
    bytes <- switch(case,
        too_large = charToRaw(paste0(strrep("x", 513), "\n")),
        truncated = charToRaw("unfinished"),
        invalid_nul = as.raw(c(120, 0, 10))
    )
    with_binary_input(bytes, function(connection) {
        result <- read_request(connection, 512L)
        stopifnot(identical(result$status, case), !length(result$bytes))
    })
}
with_binary_input(charToRaw("\n"), function(connection) {
    empty <- read_request(connection, 512L)
    stopifnot(identical(empty$status, "line"), !length(empty$bytes))
    for (limit in list(NA_real_, 511, 16777217, 512.5, c(512, 513))) {
        stopifnot(inherits(try(read_request(connection, limit), silent = TRUE), "try-error"))
    }
})
write_frame <- getExportedValue("dialogforgeruntime", "write_checked_runtime_frame")
output_path <- tempfile("dialogforge-checked-output-")
output <- file(output_path, open = "wb", blocking = TRUE)
tryCatch({
    stopifnot(write_frame(output, "frame"))
    stopifnot(inherits(try(write_frame(output, "bad\nframe"), silent = TRUE), "try-error"))
}, finally = close(output))
stopifnot(identical(readBin(output_path, "raw", n = 100), charToRaw("frame\n")))
unlink(output_path)
cat("Native bounded input/checked output file cases passed; sockets, timeout, Interrupt and startup acceptance remain separate.\n")

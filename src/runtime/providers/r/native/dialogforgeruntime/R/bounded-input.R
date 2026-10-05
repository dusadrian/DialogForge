# Only a complete line may be decoded/dispatched. Any other status requires
# retiring the connection; consumed partial bytes must never be retried.
read_bounded_runtime_request <- function(connection, max_bytes = 262144L) {
    if (length(max_bytes) != 1L || !is.numeric(max_bytes) || is.na(max_bytes) ||
        !is.finite(max_bytes) || max_bytes != trunc(max_bytes) ||
        max_bytes < 512 || max_bytes > 16777216) {
        stop("Runtime input limit must be an integer from 512 to 16777216 bytes.")
    }
    .Call(C_df_read_bounded_request, connection, as.integer(max_bytes))
}


write_checked_runtime_frame <- function(connection, payload) {
    if (!is.character(payload) || length(payload) != 1L || is.na(payload)) {
        stop("Runtime frame must be one string.")
    }
    payload <- enc2utf8(payload)
    if (nchar(payload, type = "bytes") > 16777216 || grepl("\n", payload, fixed = TRUE)) {
        stop("Runtime frame is oversized or contains a framing newline.")
    }
    .Call(C_df_write_runtime_frame, connection, charToRaw(paste0(payload, "\n")))
}


read_runtime_console_line <- function(prompt, max_bytes = 262144L, host_transport = FALSE) {
    if (
        !is.character(prompt) || length(prompt) != 1L || is.na(prompt) ||
        !is.numeric(max_bytes) || length(max_bytes) != 1L || is.na(max_bytes) ||
        !is.finite(max_bytes) || max_bytes != trunc(max_bytes) ||
        max_bytes < 512 || max_bytes > 16777216 ||
        !is.logical(host_transport) || length(host_transport) != 1L || is.na(host_transport)
    ) {
        stop("Host console input requires one prompt and a bounded byte limit.")
    }
    .Call(C_df_read_runtime_console_line, prompt, as.integer(max_bytes), host_transport)
}


with_runtime_console_input <- function(evaluate, read_reply) {
    if (typeof(evaluate) != "closure" || typeof(read_reply) != "closure") {
        stop("Console input requires evaluation and reply functions.")
    }
    .Call(C_df_with_runtime_console_input, evaluate, read_reply)
}

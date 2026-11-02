# The caller owns sink installation/restoration and the private journal path.
open_output_capture <- function(path) {
    .Call(C_df_output_open, path)
}


# Remove both sinks before sealing. This is a producer seal, not a drain ack.
seal_output_capture <- function(capture) {
    .Call(C_df_output_seal, capture$handle)
}


abort_output_capture <- function(capture) {
    .Call(C_df_output_abort, capture$handle)
    invisible(NULL)
}


# Selection policy belongs to the shared runtime, not the connection adapter.
open_message_output <- function(stdout, stderr, selector) {
    .Call(C_df_message_output_open, stdout, stderr, selector)
}

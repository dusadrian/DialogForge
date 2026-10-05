# The caller owns sink installation/restoration and the private journal path.
open_output_capture <- function(path) {
    .Call(df_output_open, path)
}


# Remove both sinks before sealing. This is a producer seal, not a drain ack.
seal_output_capture <- function(capture) {
    .Call(df_output_seal, capture$handle)
}


abort_output_capture <- function(capture) {
    .Call(df_output_abort, capture$handle)
    invisible(NULL)
}

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
fixture$json_str <- function(value) paste0('"', value, '"')
fixture$json_bool <- function(value) {
    if (isTRUE(value)) {
        return("true")
    }
    "false"
}
sys.source(file.path(root, "src/runtime/providers/r/r-sources/runtimeTransportCore.R"), envir = fixture)

nonce <- "01234567-89ab-cdef-0123-456789abcdef:2"
raw <- paste0(
    '{"prefix":"DMRUNTIME1","id":"command","method":"evaluate_code",',
    '"auth":"secret","transportNonce":"', utils::URLencode(nonce, reserved = TRUE), '"}'
)
request <- fixture$runtime_transport_decode_request(raw, TRUE)
stopifnot(request$valid, identical(request$transportNonce, nonce))
invalid_envelopes <- c(
    paste0(raw, "trailing"),
    paste0(raw, "\n"),
    paste0("prefix", raw),
    sub('"id":"command"', '"id":"command","id":"replacement"', raw, fixed = TRUE),
    sub('"auth":"secret"', '"auth":null', raw, fixed = TRUE),
    sub('"auth":"secret"', '"auth":{"auth":"secret"}', raw, fixed = TRUE),
    sub('"auth":"secret"', '"auth":""', raw, fixed = TRUE),
    sub('"id":"command"', '"id":"bad%Q1"', raw, fixed = TRUE),
    sub('"id":"command"', '"id":"bad%00"', raw, fixed = TRUE),
    sub('"id":"command"', '"id":"unfinished%"', raw, fixed = TRUE)
)
for (invalid in invalid_envelopes) {
    rejected <- fixture$runtime_transport_decode_request(invalid, TRUE)
    stopifnot(!rejected$valid, identical(rejected$error, "invalid-request-envelope"))
}
encoded_code <- utils::URLencode("cat('é😀\\n')\nvalue <- 1 + 2", reserved = TRUE)
with_code <- sub("}$", paste0(',"code":"', encoded_code, '"}'), raw)
decoded <- fixture$runtime_transport_decode_request(with_code, TRUE)
stopifnot(decoded$valid, identical(decoded$params$code, "cat('é😀\\n')\nvalue <- 1 + 2"))
output <- list(
    id = request$id, method = request$method, ok = TRUE,
    transportNonce = request$transportNonce
)
response <- fixture$runtime_transport_response_payload(output, "null", TRUE)
stopifnot(grepl(paste0('"transportNonce":"', nonce, '"'), response, fixed = TRUE))
stopifnot(!grepl("secret", response, fixed = TRUE))

# Positional and old JSON clients retain their existing response layout.
positional <- fixture$runtime_transport_response_payload(output, "null", FALSE)
stopifnot(!grepl(nonce, positional, fixed = TRUE))
output$transportNonce <- NULL
legacy <- fixture$runtime_transport_response_payload(output, "null", TRUE)
stopifnot(!grepl("transportNonce", legacy, fixed = TRUE))
meta <- fixture$runtime_transport_meta_json(list(
    ok = TRUE, responseIdentity = "attachment-request-v1"
))
stopifnot(grepl('"responseIdentity":"attachment-request-v1"', meta, fixed = TRUE))
sys.source(file.path(root, "src/runtime/providers/r/r-sources/runtimeEventCore.R"), envir = fixture)
fixture$runtime_diagnostic_count <- function(...) invisible(NULL)
fixture$runtime_diagnostic_mark <- function(...) invisible(NULL)
identity <- list(id = "event", when = "fixture")
previous <- fixture$runtime_begin_transport_event_scope(nonce)
stopifnot(identical(previous, ""))
event <- fixture$runtime_event_payload("prompt", character(0), "activity", identity)
stopifnot(grepl(paste0('"transportNonce":"', nonce, '"'), event, fixed = TRUE))
outer <- fixture$runtime_begin_transport_event_scope("reply-nonce", preserve_current = TRUE)
stopifnot(identical(outer, nonce), identical(fixture$runtime_transport_event_nonce, nonce))
fixture$runtime_transport_event_nonce <- outer
fixture$runtime_transport_event_nonce <- previous
legacy_event <- fixture$runtime_event_payload("prompt", character(0), "activity", identity)
stopifnot(!grepl("transportNonce", legacy_event, fixed = TRUE))
fixture$runtime_begin_transport_event_scope("standalone-reply", preserve_current = TRUE)
stopifnot(identical(fixture$runtime_transport_event_nonce, "standalone-reply"))
meta <- fixture$runtime_transport_meta_json(list(ok = TRUE, eventIdentity = "request-nonce-v1"))
stopifnot(grepl('"eventIdentity":"request-nonce-v1"', meta, fixed = TRUE))
cat("Native response/event identity serialization cases passed; real nested dispatch acceptance remains separate.\n")

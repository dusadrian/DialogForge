source_file <- file.path(
    "src", "runtime", "providers", "r", "r-sources", "runtimePrelude.R"
)
runtime <- new.env(parent = globalenv())
runtime$opts <- list()
sys.source(source_file, envir = runtime)

original_escape <- function(value) {
    text <- enc2utf8(as.character(value %||% ""))
    codes <- tryCatch(utf8ToInt(text), error = function(error) integer(0))

    if (!length(codes)) {
        return("")
    }

    paste(vapply(codes, runtime$json_escape_code, character(1)), collapse = "")
}
`%||%` <- runtime$`%||%`

cases <- c(
    "", "ordinary text", "quotes: \" and backslash: \\",
    "\b\t\n\f\r", "ăâîșț — 中文 😀", NA_character_,
    intToUtf8(1:31), "\"first", "last\\", "\"\\\""
)

for (text in cases) {
    stopifnot(identical(runtime$json_escape(text), original_escape(text)))
}

# Keep a real resource-sized packet in the case set without timing assertions.
packet <- paste0('{"body":"', strrep("0123456789abcdef", 80000L), '"}')
stopifnot(identical(runtime$json_escape(packet), original_escape(packet)))
cat("Shared runtime JSON escaping cases passed.\n")

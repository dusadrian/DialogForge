local({
    library <- Sys.getenv("DIALOGFORGE_TRANSPORT_LIBRARY", unset = "")
    if (is.element("dialogforgeruntime", loadedNamespaces())) {
        helper <- asNamespace("dialogforgeruntime")
    }
    else {
        helper <- loadNamespace("dialogforgeruntime", lib.loc = library)
    }
    stopifnot(identical(as.character(getNamespaceVersion(helper)), "0.1.1"))
    scoped <- helper$with_runtime_console_input
    prompts <- character(0)
    reply <- function(prompt) {
        prompts <<- c(prompts, prompt)
        "Ω😀é"
    }
    original_interactive <- base::interactive()
    stopifnot(identical(scoped(function() {
        helper$read_runtime_console_line("direct fixture: ", 512L)
    }, reply), "Ω😀é"))
    stopifnot(identical(prompts, "direct fixture: "))
    stopifnot(identical(base::interactive(), original_interactive))
    stopifnot(identical(scoped(function() {
        base::scan(file = "", what = character(), nmax = 1L, quiet = TRUE)
    }, reply), "Ω😀é"))
    stopifnot(identical(scoped(function() {
        base::readLines(stdin(), n = 1L)
    }, reply), "Ω😀é"))

    for (value in list(NA_character_, character(0), c("first", "second"))) {
        error <- tryCatch(scoped(function() {
            helper$read_runtime_console_line("invalid reply: ", 512L)
        }, function(prompt) value), error = identity)
        stopifnot(inherits(error, "error"))
        stopifnot(grepl("one reply", conditionMessage(error), fixed = TRUE))
        stopifnot(identical(scoped(function() {
            helper$read_runtime_console_line("following reply: ", 512L)
        }, reply), "Ω😀é"))
    }

    calls <- 0L
    recovering_reply <- function(prompt) {
        calls <<- calls + 1L
        if (calls == 1L) {
            stop("controlled callback failure")
        }
        "recovered"
    }
    stopifnot(identical(scoped(function() {
        failed <- tryCatch(
            helper$read_runtime_console_line("failed callback: ", 512L), error = identity
        )
        stopifnot(inherits(failed, "error"))
        helper$read_runtime_console_line("recovered callback: ", 512L)
    }, recovering_reply), "recovered"))
    stopifnot(calls == 2L)
    stopifnot(identical(base::interactive(), original_interactive))

    stopifnot(identical(scoped(function() {
        nested <- tryCatch(scoped(function() "unreachable", reply), error = identity)
        stopifnot(inherits(nested, "error"))
        stopifnot(grepl("exclusive", conditionMessage(nested), fixed = TRUE))
        helper$read_runtime_console_line("outer survives: ", 512L)
    }, reply), "Ω😀é"))
    stopifnot(inherits(tryCatch(scoped(function() {
        stop("evaluation failure")
    }, reply), error = identity), "error"))
    stopifnot(identical(scoped(function() {
        helper$read_runtime_console_line("fresh owner: ", 512L)
    }, reply), "Ω😀é"))
    stopifnot(identical(base::interactive(), original_interactive))
    "console-scope-passed"
})

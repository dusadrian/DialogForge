# Compare actual emitted bytes with ordinary R handling in a disposable process.
local({
    arguments <- commandArgs(trailingOnly = FALSE)
    script <- sub("^--file=", "", arguments[startsWith(arguments, "--file=")][[1L]])
    root <- dirname(dirname(normalizePath(script)))
    sources <- file.path(root, "src/runtime/providers/r/r-sources")
    library <- Sys.getenv("DIALOGFORGE_OUTPUT_LIBRARY", unset = "")
    if (!nzchar(library)) {
        library <- Sys.getenv("DIALOGFORGE_TEST_INSPECTION_LIBRARY", unset = "")
    }
    if (!nzchar(library)) {
        library <- file.path(
            root, "dist/r-runtime/native",
            paste(R.version$platform, getRversion(), sep = "-")
        )
    }
    helper <- loadNamespace("dialogforgeruntime", lib.loc = library)
    stopifnot(
        identical(as.character(getNamespaceVersion(helper)), "0.1.3"),
        exists("open_message_output", envir = helper, inherits = FALSE)
    )

    runtime <- new.env(parent = globalenv())
    runtime$opts <- list()
    runtime$app_env <- runtime
    for (name in c(
        "runtimePrelude.R", "runtimeDiagnostics.R", "runtimeWarningCore.R",
        "runtimeDispatchCore.R", "runtimeOrderedCapturePrototype.R"
    )) {
        sys.source(file.path(sources, name), envir = runtime)
    }
    runtime$trace <- function(message) invisible(NULL)
    runtime$dialog_record_traceback <- function() invisible(NULL)

    previous_options <- options(
        warn = 1L, width = 80L, cli.width = 80L, cli.num_colors = 1L
    )
    on.exit(options(previous_options), add = TRUE)

    method_name <- "conditionMessage.DF_message_output_fixture"
    stopifnot(!exists(method_name, .GlobalEnv, inherits = FALSE))
    assign(method_name, function(condition) condition$message, envir = .GlobalEnv)
    on.exit(rm(list = method_name, envir = .GlobalEnv), add = TRUE)

    capture_reference <- function(code) {
        connection <- rawConnection(raw(), "w")
        original_message <- sink.number(type = "message")
        original_connection <- getConnection(original_message)
        depth <- sink.number(type = "output")
        on.exit({
            sink(original_connection, type = "message")
            while (sink.number(type = "output") > depth) {
                sink(type = "output")
            }
            close(connection)
        }, add = TRUE)
        sink(connection, type = "output")
        sink(connection, type = "message")
        invisible(eval(parse(text = code), envir = .GlobalEnv))
        rawToChar(rawConnectionValue(connection))
    }

    read_journal <- function(path) {
        connection <- file(path, "rb")
        on.exit(close(connection), add = TRUE)
        stopifnot(identical(rawToChar(readBin(connection, "raw", 8L)), "DFOUT001"))
        output <- list()
        errors <- list()
        all <- list()
        repeat {
            channel <- readBin(connection, "integer", 1L, size = 1L, signed = FALSE)
            stopifnot(length(channel) == 1L)
            sequence <- readBin(connection, "raw", 8L)
            length <- readBin(connection, "integer", 1L, size = 4L, endian = "big")
            stopifnot(length(sequence) == 8L, length(length) == 1L, length >= 0L)
            if (channel == 0L) {
                stopifnot(length == 0L)
                break
            }
            bytes <- readBin(connection, "raw", length)
            stopifnot(length(bytes) == length, is.element(channel, c(1L, 2L)))
            all[[length(all) + 1L]] <- bytes
            if (channel == 1L) {
                output[[length(output) + 1L]] <- bytes
            }
            else {
                errors[[length(errors) + 1L]] <- bytes
            }
        }
        join <- function(parts) {
            if (!length(parts)) {
                return("")
            }
            rawToChar(do.call(c, parts))
        }
        list(all = join(all), output = join(output), errors = join(errors))
    }

    capture_ordered <- function(code) {
        path <- tempfile("dialogforge-message-output-")
        on.exit(unlink(path), add = TRUE)
        backend <- list(
            open = helper$open_output_capture,
            seal = helper$seal_output_capture,
            abort = helper$abort_output_capture
        )
        result <- runtime$runtime_capture_ordered_input(code, path, backend)
        stopifnot(isTRUE(result$ok), identical(result$capture_status, "sealed"))
        read_journal(path)
    }

    fixtures <- list(
        list(name = "ordinary messages", code = 'message("first"); message("second")'),
        list(name = "no line-ending request", code = 'message("first", appendLF=FALSE); message("second")'),
        list(name = "blank and Unicode messages", code = 'message(""); message("Ω\\n\\n😀")'),
        list(name = "package startup messages", code = 'packageStartupMessage("first"); packageStartupMessage("second", appendLF=FALSE)'),
        list(name = "nested suppression", code = paste0(
            'suppressMessages({message("hidden"); ',
            'suppressPackageStartupMessages(packageStartupMessage("also hidden"))}); ',
            'message("visible")'
        )),
        list(name = "startup-only suppression", code = paste0(
            'suppressPackageStartupMessages({packageStartupMessage("hidden"); ',
            'message("visible")})'
        )),
        list(name = "signalling alone has no default output", code = 'invisible(signalCondition(simpleMessage("unprinted"))); message("visible")'),
        list(name = "custom condition dispatch and vector separators", code = paste0(
            'message(structure(list(message=c("left","right")), ',
            'class=c("DF_message_output_fixture","message","condition")))'
        )),
        list(name = "custom default emitter", code = paste0(
            'local({condition <- simpleMessage("payload"); ',
            'withRestarts({signalCondition(condition); ',
            'cat("<<", conditionMessage(condition), ">>\\n", file=stderr(), sep="")}, ',
            'muffleMessage=function() NULL)})'
        )),
        list(name = "custom default without line ending", code = paste0(
            'local({condition <- simpleMessage("payload"); ',
            'withRestarts({signalCondition(condition); ',
            'cat("<<", conditionMessage(condition), ">>", file=stderr(), sep="")}, ',
            'muffleMessage=function() NULL)})'
        )),
        list(name = "user message sink", code = paste0(
            'local({private <- rawConnection(raw(),"w"); ',
            'previous <- getConnection(sink.number("message")); ',
            'on.exit({sink(previous,type="message");close(private)}); ',
            'sink(private,type="message");message("private"); ',
            'sink(previous,type="message");message("public")})'
        ))
    )
    if (requireNamespace("rlang", quietly = TRUE)) {
        fixtures <- c(fixtures, list(
            list(name = "rlang default termination", code = 'rlang::inform("first"); rlang::inform("second")'),
            list(name = "rlang startup termination", code = 'rlang::inform("first",class="packageStartupMessage"); rlang::inform("second",class="packageStartupMessage")'),
            list(name = "base emitter retains condition semantics", code = 'message(rlang::message_cnd("fixture",message="unchanged"))')
        ))
    }
    if (requireNamespace("cli", quietly = TRUE)) {
        fixtures <- c(fixtures, list(
            list(name = "cli formatted message", code = 'cli::cli_inform(c("Header", "i"="Body Ω"))')
        ))
    }

    for (fixture in fixtures) {
        expected <- capture_reference(fixture$code)
        grouped <- runtime$runtime_capture_input(fixture$code, "message-fixture")
        startup <- runtime$runtime_startup_capture(parse(text = fixture$code), .GlobalEnv)
        ordered <- capture_ordered(fixture$code)
        if (!isTRUE(grouped$ok) || !isTRUE(startup$ok)) {
            stop(paste(fixture$name, grouped$error, startup$error))
        }
        captures <- list(
            grouped = paste(grouped$messages, collapse = ""),
            startup = paste(startup$messages, collapse = ""),
            ordered = ordered$output
        )
        for (name in names(captures)) {
            if (!identical(captures[[name]], expected)) {
                stop(paste0(
                    fixture$name, " differs through ", name, ": ",
                    encodeString(captures[[name]], quote = '"'), " expected ",
                    encodeString(expected, quote = '"')
                ))
            }
        }
        stopifnot(identical(ordered$errors, ""), identical(ordered$all, expected))
    }

    # Raw stderr after a message or inside an unrelated named restart must keep
    # its original channel. A handled error must retire the observed scope too.
    direct_fixtures <- c(
        'message("ordinary"); cat("raw\\n", file=stderr())',
        'withRestarts(cat("raw\\n",file=stderr()),muffleMessage=function()NULL)',
        paste0(
            'invisible(tryCatch(withRestarts({signalCondition(simpleMessage("unprinted")); ',
            'stop("handled")},muffleMessage=function()NULL),error=function(e)NULL)); ',
            'cat("raw\\n",file=stderr())'
        )
    )
    for (code in direct_fixtures) {
        reference <- capture_reference(code)
        ordered <- capture_ordered(code)
        stopifnot(identical(ordered$all, reference), identical(ordered$errors, "raw\n"))
    }

    # Startup raw stderr is replayed after restoring the caller's sink. Exercise
    # the real standard-error connection too, not only an outer test sink.
    startup <- runtime$runtime_startup_capture(
        quote(cat("startup raw stderr fixture\n", file = stderr())), .GlobalEnv
    )
    stopifnot(isTRUE(startup$ok), sink.number(type = "message") == 2L)

    replay <- rawConnection(raw(), "w")
    sink(replay, type = "message")
    startup <- runtime$runtime_startup_capture(
        quote({message("startup message"); cat("caller stderr\n", file = stderr())}),
        .GlobalEnv
    )
    sink(type = "message")
    stopifnot(
        isTRUE(startup$ok),
        identical(startup$messages, "startup message\n"),
        identical(rawToChar(rawConnectionValue(replay)), "caller stderr\n")
    )
    close(replay)

    nested_warning <- paste0(
        'local({condition <- simpleMessage("payload"); ',
        'withRestarts({signalCondition(condition); ',
        'warning("nested warning",call.=FALSE,immediate.=TRUE); ',
        'cat("emitted\\n",file=stderr())},muffleMessage=function()NULL)})'
    )
    warning_reference <- capture_reference(nested_warning)
    ordered <- capture_ordered(nested_warning)
    stopifnot(
        identical(ordered$all, warning_reference),
        identical(ordered$output, "emitted\n"),
        grepl("nested warning", ordered$errors, fixed = TRUE)
    )

    nested_message <- paste0(
        'withRestarts({signalCondition(simpleWarning("unprinted")); ',
        'message("nested message");cat("warning emitter\\n",file=stderr())}, ',
        'muffleWarning=function()NULL)'
    )
    ordered <- capture_ordered(nested_message)
    stopifnot(
        identical(ordered$all, capture_reference(nested_message)),
        identical(ordered$output, "nested message\n"),
        identical(ordered$errors, "warning emitter\n")
    )

    # The proxy owns references to its targets and selector until close, while
    # caller-owned destinations remain usable after that close.
    output <- rawConnection(raw(), "w")
    errors <- rawConnection(raw(), "w")
    failure <- tryCatch(
        helper$open_message_output(output, stderr(), function() FALSE),
        error = conditionMessage
    )
    stopifnot(grepl("explicit non-console connections", failure, fixed = TRUE))
    invalid <- helper$open_message_output(output, errors, function() NA)
    failure <- tryCatch(cat("unwritten", file = invalid), error = conditionMessage)
    stopifnot(grepl("one non-missing logical value", failure, fixed = TRUE))
    close(invalid)
    proxy <- helper$open_message_output(output, errors, function() { gc(); TRUE })
    cat("Ω\n", file = proxy)
    close(proxy)
    cat("after\n", file = output)
    stopifnot(identical(rawToChar(rawConnectionValue(output)), "Ω\nafter\n"))
    close(output)
    close(errors)

    output <- rawConnection(raw(), "w")
    errors <- rawConnection(raw(), "w")
    selection_fails <- TRUE
    proxy <- helper$open_message_output(output, errors, function() {
        if (selection_fails) {
            stop("expected selector failure")
        }
        TRUE
    })
    failure <- tryCatch(cat("unwritten", file = proxy), error = conditionMessage)
    stopifnot(identical(failure, "expected selector failure"))
    selection_fails <- FALSE
    cat("recovered", file = proxy)
    stopifnot(identical(rawToChar(rawConnectionValue(output)), "recovered"))
    close(proxy)
    close(output)
    close(errors)

    cat(length(fixtures), "message fixtures match default R bytes through all three captures;",
        "restart expiry, warning routing, caller sinks and proxy lifetime passed.\n")
})

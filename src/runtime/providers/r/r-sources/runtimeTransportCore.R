runtime_transport_encode <- function(value) {
    utils::URLencode(as.character(value %||% ""), reserved = TRUE)
}


runtime_transport_decode <- function(value) {
    utils::URLdecode(as.character(value %||% ""))
}


runtime_transport_value <- function(fields, key) {
    value <- fields[[key]] %||% ""
    if (grepl("%", value, fixed = TRUE)) {
        return(runtime_transport_decode(value))
    }
    value
}


runtime_transport_number <- function(fields, key) {
    suppressWarnings(as.numeric(runtime_transport_value(fields, key)))
}


runtime_transport_integer <- function(fields, key) {
    suppressWarnings(as.integer(runtime_transport_value(fields, key)))
}


runtime_transport_flag <- function(fields, key, default = FALSE) {
    value <- runtime_transport_value(fields, key)

    if (!nzchar(value)) return(isTRUE(default))

    identical(value, "1")
}


runtime_transport_vector <- function(fields, key) {
    value <- runtime_transport_value(fields, key)

    if (!nzchar(value)) return(character(0))

    strsplit(value, "\037", fixed = FALSE)[[1L]]
}


runtime_transport_numeric_vector <- function(fields, key) {
    suppressWarnings(as.numeric(runtime_transport_vector(fields, key)))
}


runtime_transport_optional_value <- function(fields, key, supplied) {
    if (!isTRUE(supplied)) {
        return(NULL)
    }

    runtime_transport_value(fields, key)
}


runtime_transport_optional_number <- function(fields, key, supplied) {
    if (!isTRUE(supplied)) {
        return(NULL)
    }

    runtime_transport_number(fields, key)
}


runtime_transport_categories <- function(fields, supplied = FALSE) {
    values <- runtime_transport_vector(fields, "categoryValues")
    labels <- runtime_transport_vector(fields, "categoryLabels")
    missing <- runtime_transport_vector(fields, "categoryMissing")
    count <- max(length(values), length(labels), length(missing), 0L)

    if (!count) {
        if (isTRUE(supplied)) {
            return(list())
        }

        return(NULL)
    }

    lapply(seq_len(count), function(index) {
        list(
            value = if (index <= length(values)) values[[index]] else "",
            label = if (index <= length(labels)) labels[[index]] else "",
            isMissing = index <= length(missing) && identical(missing[[index]], "1")
        )
    })
}


runtime_transport_missing_range <- function(fields, supplied = FALSE) {
    minimum <- runtime_transport_value(fields, "missingRangeMin")
    maximum <- runtime_transport_value(fields, "missingRangeMax")

    if (identical(minimum, "__NULL__") || identical(maximum, "__NULL__")) {
        return(list(min = "", max = ""))
    }

    if (!nzchar(minimum) && !nzchar(maximum)) {
        if (isTRUE(supplied)) {
            return(list(min = "", max = ""))
        }

        return(NULL)
    }

    list(min = minimum, max = maximum)
}


runtime_transport_attribute_changes <- function(fields) {
    if (!runtime_transport_flag(fields, "hasAttributeChanges")) {
        return(NULL)
    }
    encoded <- runtime_transport_value(fields, "attributeChanges")
    if (!nzchar(encoded)) {
        return(list())
    }

    lapply(strsplit(encoded, "\036")[[1L]], function(record) {
        fields <- strsplit(record, "\037")[[1L]]
        if (length(fields) != 7L || any(!startsWith(fields, "v"))) {
            stop("Invalid attribute changes")
        }
        fields <- vapply(substring(fields, 2L), runtime_transport_decode, character(1))
        list(
            source = fields[[1L]], name = fields[[2L]], type = fields[[3L]],
            value = fields[[4L]], remove = identical(fields[[5L]], "1"),
            previousType = fields[[6L]], previousValue = fields[[7L]]
        )
    })
}


runtime_transport_dedicated_params <- function(fields) {
    has_type <- runtime_transport_flag(fields, "hasType")
    has_measure <- runtime_transport_flag(fields, "hasMeasure")
    has_label <- runtime_transport_flag(fields, "hasLabel")
    has_width <- runtime_transport_flag(fields, "hasWidth")
    has_decimals <- runtime_transport_flag(fields, "hasDecimals")
    has_align <- runtime_transport_flag(fields, "hasAlign")
    has_categories <- runtime_transport_flag(fields, "hasCategories")
    has_missing_range <- runtime_transport_flag(fields, "hasMissingRange")

    list(
        code = runtime_transport_value(fields, "code"),
        mode = runtime_transport_value(fields, "mode"),
        outputWidth = runtime_transport_integer(fields, "outputWidth"),
        planInput = runtime_transport_value(fields, "planInput"),
        timeoutMs = runtime_transport_number(fields, "timeoutMs"),
        sessionId = runtime_transport_number(fields, "sessionId"),
        diagnosticSession = runtime_transport_value(fields, "diagnosticSession"),
        topic = runtime_transport_value(fields, "topic"),
        package = runtime_transport_value(fields, "package"),
        prefix = runtime_transport_value(fields, "requestPrefix"),
        cursorColumn = runtime_transport_integer(fields, "cursorColumn"),
        includeInternals = runtime_transport_flag(fields, "includeInternals"),
        forceRefresh = runtime_transport_flag(fields, "forceRefresh"),
        path = runtime_transport_value(fields, "path"),
        reader = runtime_transport_value(fields, "reader"),
        nrows = runtime_transport_number(fields, "nrows"),
        binary = runtime_transport_flag(fields, "binary"),
        header = runtime_transport_flag(fields, "header", default = TRUE),
        rowNames = runtime_transport_integer(fields, "rowNames"),
        sep = runtime_transport_value(fields, "sep"),
        quote = runtime_transport_value(fields, "quote"),
        dec = runtime_transport_value(fields, "dec"),
        naStrings = runtime_transport_value(fields, "naStrings"),
        skip = runtime_transport_number(fields, "skip"),
        stripWhite = runtime_transport_flag(fields, "stripWhite"),
        commentChar = runtime_transport_value(fields, "commentChar"),
        fileEncoding = runtime_transport_value(fields, "fileEncoding"),
        parentId = runtime_transport_value(fields, "parentId"),
        outputCaptureName = runtime_transport_value(fields, "outputCaptureName"),
        outputCaptureSession = runtime_transport_value(fields, "outputCaptureSession"),
        promptId = runtime_transport_value(fields, "promptId"),
        reply = runtime_transport_value(fields, "reply"),
        names = runtime_transport_vector(fields, "names"),
        name = runtime_transport_value(fields, "name"),
        oldName = runtime_transport_value(fields, "oldName"),
        newName = runtime_transport_value(fields, "newName"),
        nextName = runtime_transport_value(fields, "nextName"),
        targetName = runtime_transport_value(fields, "targetName"),
        variableName = runtime_transport_value(fields, "variableName"),
        variableNames = runtime_transport_vector(fields, "variableNames"),
        xVariableName = runtime_transport_value(fields, "xVariableName"),
        yVariableName = runtime_transport_value(fields, "yVariableName"),
        solutionName = runtime_transport_value(fields, "solutionName"),
        branch = runtime_transport_value(fields, "branch"),
        model = runtime_transport_value(fields, "model"),
        ambiguity = runtime_transport_value(fields, "ambiguity"),
        title = runtime_transport_value(fields, "title"),
        legend = runtime_transport_flag(fields, "legend", default = TRUE),
        useLabels = if (nzchar(runtime_transport_value(fields, "useLabels"))) {
            runtime_transport_flag(fields, "useLabels")
        } else {
            NULL
        },
        coreSelections = stats::setNames(
            runtime_transport_vector(fields, "coreSelectionValues"),
            runtime_transport_vector(fields, "coreSelectionNames")
        ),
        thresholds = runtime_transport_numeric_vector(fields, "thresholds"),
        thresholdNames = runtime_transport_vector(fields, "thresholdNames"),
        variant = runtime_transport_value(fields, "variant"),
        logistic = runtime_transport_flag(fields, "logistic"),
        ecdf = runtime_transport_flag(fields, "ecdf"),
        idm = runtime_transport_number(fields, "idm"),
        below = runtime_transport_number(fields, "below"),
        above = runtime_transport_number(fields, "above"),
        increasing = runtime_transport_flag(fields, "increasing", default = TRUE),
        bell = runtime_transport_flag(fields, "bell"),
        decreasing = runtime_transport_flag(fields, "decreasing"),
        naLast = runtime_transport_flag(fields, "naLast", default = TRUE),
        emptyLast = runtime_transport_flag(fields, "emptyLast", default = TRUE),
        type = runtime_transport_optional_value(fields, "type", has_type),
        measure = runtime_transport_optional_value(
            fields,
            "measure",
            has_measure
        ),
        label = runtime_transport_optional_value(fields, "label", has_label),
        attributeChanges = runtime_transport_attribute_changes(fields),
        categories = runtime_transport_categories(fields, has_categories),
        missingRange = runtime_transport_missing_range(fields, has_missing_range),
        width = runtime_transport_optional_number(fields, "width", has_width),
        decimals = runtime_transport_optional_number(
            fields,
            "decimals",
            has_decimals
        ),
        align = runtime_transport_optional_value(fields, "align", has_align),
        row = runtime_transport_number(fields, "row"),
        column = runtime_transport_value(fields, "column"),
        position = runtime_transport_value(fields, "position"),
        value = runtime_transport_value(fields, "value"),
        rowStart = runtime_transport_number(fields, "rowStart"),
        rowCount = runtime_transport_number(fields, "rowCount"),
        columnCount = runtime_transport_number(fields, "columnCount"),
        start = runtime_transport_number(fields, "start"),
        nth = runtime_transport_integer(fields, "nth"),
        count = runtime_transport_number(fields, "count"),
        columns = runtime_transport_vector(fields, "columns")
    )
}


runtime_transport_part <- function(parts, index) {
    if (index > length(parts)) return("")

    runtime_transport_decode(parts[[index]])
}


runtime_transport_interactive_params <- function(parts) {
    columns <- runtime_transport_part(parts, 19L)

    list(
        code = runtime_transport_part(parts, 5L),
        mode = runtime_transport_part(parts, 6L),
        timeoutMs = suppressWarnings(as.numeric(runtime_transport_part(parts, 7L))),
        sessionId = suppressWarnings(as.numeric(runtime_transport_part(parts, 8L))),
        topic = runtime_transport_part(parts, 9L),
        package = runtime_transport_part(parts, 10L),
        prefix = runtime_transport_part(parts, 11L),
        includeInternals = identical(runtime_transport_part(parts, 12L), "1"),
        path = runtime_transport_part(parts, 13L),
        parentId = runtime_transport_part(parts, 14L),
        promptId = runtime_transport_part(parts, 21L),
        reply = runtime_transport_part(parts, 15L),
        name = runtime_transport_part(parts, 16L),
        rowStart = suppressWarnings(as.numeric(runtime_transport_part(parts, 17L))),
        rowCount = suppressWarnings(as.numeric(runtime_transport_part(parts, 18L))),
        columnCount = suppressWarnings(as.numeric(runtime_transport_part(parts, 20L))),
        columns = if (nzchar(columns)) {
            strsplit(columns, "\037", fixed = FALSE)[[1L]]
        } else {
            character(0)
        }
    )
}


runtime_transport_json_fields <- function(raw, require_auth = TRUE) {
    # Both host adapters use compact, flat URL-encoded string fields.
    field <- "\"[A-Za-z][A-Za-z0-9]*\":\"[A-Za-z0-9_.!~*'()%+-]*\""
    envelope <- paste0("\\A\\{", field, "(?:,", field, ")*\\}\\z")
    if (!grepl(envelope, raw, perl = TRUE) ||
        grepl("%(?![A-Fa-f0-9]{2})", raw, perl = TRUE) ||
        grepl("%00", raw, fixed = TRUE)) {
        return(NULL)
    }

    # Validated URL-encoded values contain neither literal commas nor quotes.
    pairs <- strsplit(substr(raw, 2L, nchar(raw) - 1L), ",", fixed = TRUE)[[1L]]
    if (length(pairs) > 256L) {
        return(NULL)
    }
    separators <- regexpr('":"', pairs, fixed = TRUE)
    keys <- substr(pairs, 2L, separators - 1L)
    if (base::anyDuplicated.default(keys)) {
        return(NULL)
    }

    values <- substr(pairs, separators + 3L, nchar(pairs) - 1L)
    fields <- stats::setNames(as.list(values), keys)
    required <- c("prefix", "id", "method")
    if (isTRUE(require_auth)) {
        required <- c(required, "auth")
    }
    for (key in required) {
        if (!nzchar(fields[[key]] %||% "")) {
            return(NULL)
        }
    }
    fields
}


runtime_transport_decode_request <- function(raw, dedicated, require_auth = TRUE) {
    if (isTRUE(dedicated)) {
        fields <- runtime_transport_json_fields(raw, require_auth)
        if (is.null(fields)) {
            return(list(valid = FALSE, error = "invalid-request-envelope"))
        }
        prefix <- runtime_transport_value(fields, "prefix")

        if (!identical(prefix, "DMRUNTIME1")) {
            return(list(valid = FALSE, error = "invalid-request"))
        }

        request <- tryCatch(list(
            valid = TRUE,
            id = runtime_transport_value(fields, "id"),
            method = runtime_transport_value(fields, "method"),
            auth = runtime_transport_value(fields, "auth"),
            transportNonce = runtime_transport_value(fields, "transportNonce"),
            params = runtime_transport_dedicated_params(fields)
        ), error = function(error) {
            list(valid = FALSE, error = "invalid-request-encoding")
        })
        if (identical(request$method, "workspace.column_clipboard_page")) {
            request$params$key <- runtime_transport_value(fields, "clipboardKey")
            request$params$retainKey <- runtime_transport_value(fields, "retainClipboardKey")
            request$params$includeLabels <- runtime_transport_flag(fields, "includeLabels")
        }
        return(request)
    }

    parts <- strsplit(raw, "\t", fixed = FALSE)[[1L]]

    if (length(parts) < 7L || !identical(parts[[1L]], "DMRPC1")) {
        return(list(valid = FALSE, error = "invalid-request"))
    }

    list(
        valid = TRUE,
        id = runtime_transport_part(parts, 2L),
        method = runtime_transport_part(parts, 3L),
        auth = runtime_transport_part(parts, 4L),
        params = runtime_transport_interactive_params(parts)
    )
}


runtime_transport_workspace_json <- function(snapshot) {
    snapshot <- snapshot %||% list()
    diagnostics <- snapshot$diagnostics %||% list()
    count <- suppressWarnings(as.integer(snapshot$objectCount %||% 0L))

    if (!is.finite(count) || is.na(count)) count <- 0L

    paste0(
        "{\"searchPath\":", json_strv(as.character(
            snapshot$searchPath %||% character(0)
        )),
        ",\"dataframe\":", json_df(snapshot$dataframe %||% list()),
        ",\"select\":{",
        "\"list\":", json_strv(as.character(
            (snapshot$select %||% list())$list %||% character(0)
        )),
        ",\"matrix\":", json_strv(as.character(
            (snapshot$select %||% list())$matrix %||% character(0)
        )),
        ",\"vector\":", json_strv(as.character(
            (snapshot$select %||% list())$vector %||% character(0)
        )),
        "},\"variables\":", json_variables(snapshot$variables %||% list()),
        ",\"objectCount\":", as.character(count),
        ",\"workspaceRevision\":", json_workspace_revision(snapshot$workspaceRevision),
        ",\"diagnostics\":{",
        "\"snapshotStartedMs\":", json_num(diagnostics$snapshotStartedMs),
        ",\"snapshotCompletedMs\":", json_num(diagnostics$snapshotCompletedMs),
        ",\"snapshotDurationMs\":", json_num(diagnostics$snapshotDurationMs),
        "}}"
    )
}


runtime_transport_inspection_json <- function(result) {
    paste0(
        "{\"name\":", json_str(as.character(result$name %||% "")),
        ",\"class\":", json_strv(as.character(result$class %||% character(0))),
        ",\"type\":", json_str(as.character(result$type %||% "")),
        ",\"kind\":", json_str(as.character(result$kind %||% "")),
        ",\"length\":", json_num(result$length %||% 0),
        ",\"size\":", json_num(result$size %||% 0),
        ",\"dim\":", json_strv(as.character(result$dim %||% integer(0))),
        ",\"names\":", json_strv(as.character(result$names %||% character(0))),
        ",\"hasViewer\":", json_bool(result$hasViewer),
        ",\"preview\":", json_str(as.character(result$preview %||% "")),
        "}"
    )
}


runtime_transport_result_json <- function(method, output) {
    if (!isTRUE(output$ok)) return("null")

    if (nzchar(as.character(output$result_json %||% ""))) {
        return(as.character(output$result_json))
    }

    if (is.element(method, c(
        "workspace.snapshot",
        "workspace.remove",
        "workspace.rename",
        "workspace.clear"
    ))) {
        return(runtime_transport_workspace_json(output$result))
    }

    if (is.element(method, c(
        "workspace.update",
        "workspace.complete_visible_command"
    ))) {
        return(json_workspace_update(output$result %||% list()))
    }

    if (identical(method, "workspace.inspect")) {
        return(runtime_transport_inspection_json(output$result %||% list()))
    }

    if (identical(method, "execute_input") && !is.null(output$output_capture)) {
        receipt <- output$output_capture
        return(paste0(
            "{\"sessionId\":", json_str(receipt$sessionId),
            ",\"parentId\":", json_str(receipt$parentId),
            ",\"captureStatus\":", json_str(receipt$captureStatus),
            ",\"captureError\":", json_str(receipt$captureError %||% ""),
            if (!is.null(output$input_plan)) paste0(',"inputPlan":', runtime_console_plan_json(output$input_plan)),
            ",\"outputSequence\":", if (is.null(receipt$outputSequence)) "null" else
                as.character(receipt$outputSequence), "}"
        ))
    }
    if (identical(method, "execute_input") && !is.null(output$input_plan)) {
        return(paste0('{"inputPlan":', runtime_console_plan_json(output$input_plan), '}'))
    }
    if (is.element(method, c("execute_input", "reply_prompt", "load_workspace"))) {
        return("true")
    }

    if (identical(method, "evaluate_code")) {
        return(json_str(as.character(output$result %||% "")))
    }

    if (identical(method, "completion.request")) {
        return(json_completion_result(output$result %||% list()))
    }

    if (identical(method, "check_completeness")) {
        return(json_completeness_result(output$result %||% list(state = "unknown")))
    }

    if (identical(method, "get_working_directory")) {
        return(json_working_directory_result(output$result %||% list(path = "")))
    }

    if (is.element(method, c("show_help_topic", "search_help_topic"))) {
        return(json_help_result(output$result %||% list(kind = "single", path = "")))
    }

    "null"
}


runtime_transport_error_payload <- function(error, dedicated) {
    if (isTRUE(dedicated)) {
        return(paste0(
            "{\"id\":\"\",\"method\":\"\",\"ok\":false,\"error\":",
            json_str(error),
            "}"
        ))
    }

    paste(
        c(
            "DMRPC1R",
            runtime_transport_encode(""),
            runtime_transport_encode(""),
            "0",
            runtime_transport_encode(error),
            runtime_transport_encode("null"),
            runtime_transport_encode("")
        ),
        collapse = "\t"
    )
}


runtime_run_control_request_action <- function(action) {
    result <- NULL
    completed <- FALSE

    tryCatch(
        suspendInterrupts({
            result <- action()
            completed <- TRUE
            tryCatch(
                allowInterrupts(Sys.sleep(0)),
                interrupt = function(condition) invisible(NULL)
            )
        }),
        interrupt = function(condition) {
            if (!completed) {
                signalCondition(condition)
                stop("Control request was interrupted before response delivery completed.", call. = FALSE)
            }
            invisible(NULL)
        }
    )

    result
}


runtime_evaluate_control_request <- function(request, collect_events = FALSE) {
    method <- request$method
    if (
        nzchar(as.character(current_activity_id %||% "")) &&
        !identical(method, "reply_prompt")
    ) {
        return(list(
            id = request$id, method = method,
            ok = FALSE, error = "runtime-command-active"
        ))
    }

    previous_live_events <- live_events_enabled
    if (is.element(method, c("execute_input", "reply_prompt"))) {
        live_events_enabled <<- TRUE
    }
    on.exit(live_events_enabled <<- previous_live_events, add = TRUE)

    previous_event_nonce <- runtime_begin_transport_event_scope(
        request$transportNonce,
        preserve_current = identical(method, "reply_prompt")
    )
    on.exit(runtime_transport_event_nonce <<- previous_event_nonce, add = TRUE)
    previous_diagnostics <- runtime_diagnostic_begin(request$params)
    on.exit(runtime_diagnostics <<- previous_diagnostics, add = TRUE)

    if (isTRUE(collect_events)) {
        previous_events <- runtime_collected_events
        runtime_begin_event_collection()
        on.exit(runtime_collected_events <<- previous_events, add = TRUE)
    }

    output <- tryCatch(
        eval_method(method, request$params),
        error = function(error) list(ok = FALSE, error = conditionMessage(error))
    )
    if (is.null(output)) {
        output <- list(ok = FALSE, error = "control-eval-failed")
    }

    flush_error <- ""
    tryCatch(
        flush_completion_queue(),
        error = function(error) {
            flush_error <<- conditionMessage(error)
            invisible(NULL)
        }
    )
    if (nzchar(flush_error)) {
        output$ok <- FALSE
        output$completionFailure <- TRUE
        if (!nzchar(as.character(output$error %||% ""))) {
            output$error <- flush_error
        }
        runtime_diagnostic_mark("completion.flush_failed")
    }

    output$id <- request$id
    output$method <- method
    output$transportNonce <- request$transportNonce
    output$diagnostics_json <- runtime_diagnostic_json()
    if (isTRUE(collect_events)) {
        events <- runtime_take_collected_events()
        output$events_json <- paste0("[", paste(events, collapse = ","), "]")
    }

    output
}


runtime_transport_response_payload <- function(output, result_json, dedicated) {
    if (isTRUE(dedicated)) {
        events_json <- as.character(output$events_json %||% "[]")

        return(paste0(
            "{\"id\":", json_str(output$id %||% ""),
            ",\"method\":", json_str(output$method %||% ""),
            if (nzchar(output$transportNonce %||% "")) {
                paste0(",\"transportNonce\":", json_str(output$transportNonce))
            } else "",
            ",\"ok\":", json_bool(isTRUE(output$ok)),
            if (isTRUE(output$completionFailure)) ",\"completionFailure\":true" else "",
            ",\"result\":", result_json,
            ",\"error\":", json_str(output$error %||% ""),
            ",\"mode\":", json_str(output$mode %||% ""),
            ",\"events\":", events_json,
            if (!is.null(output$diagnostics_json)) {
                paste0(",\"diagnostics\":", output$diagnostics_json)
            } else "",
            "}"
        ))
    }

    paste(
        c(
            "DMRPC1R",
            runtime_transport_encode(output$id %||% ""),
            runtime_transport_encode(output$method %||% ""),
            if (isTRUE(output$ok)) "1" else "0",
            runtime_transport_encode(output$error %||% ""),
            runtime_transport_encode(result_json),
            runtime_transport_encode(output$mode %||% "")
        ),
        collapse = "\t"
    )
}


runtime_transport_meta_json <- function(meta) {
    port_value <- suppressWarnings(as.integer(meta$port %||% NA))
    pid_value <- suppressWarnings(as.integer(meta$pid %||% NA))
    encoded_port <- if (is.finite(port_value) && !is.na(port_value)) {
        as.character(port_value)
    } else {
        "null"
    }
    encoded_pid <- if (is.finite(pid_value) && !is.na(pid_value)) {
        as.character(pid_value)
    } else {
        "null"
    }

    paste0(
        "{\"ok\":", json_bool(isTRUE(meta$ok)),
        ",\"host\":", json_str(as.character(meta$host %||% "")),
        ",\"port\":", encoded_port,
        ",\"token\":", json_str(as.character(meta$token %||% "")),
        ",\"protocol\":", json_str(as.character(meta$protocol %||% "")),
        ",\"responseIdentity\":", json_str(meta$responseIdentity %||% ""),
        ",\"eventIdentity\":", json_str(meta$eventIdentity %||% ""),
        if (identical(meta$boundedInput, "native-v1")) {
            paste0(
                ",\"boundedInput\":", json_str(meta$boundedInput),
                ",\"maxRequestBytes\":", as.character(meta$maxRequestBytes)
            )
        } else "",
        ",\"pid\":", encoded_pid,
        ",\"orderedOutputEncoding\":", json_str(meta$orderedOutputEncoding %||% ""),
        ",\"orderedOutputSession\":", json_str(meta$orderedOutputSession %||% ""),
        ",\"error\":", json_str(as.character(meta$error %||% "")),
        "}"
    )
}

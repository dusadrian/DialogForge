runtime_transport_encode <- function(value) {
    utils::URLencode(as.character(value %||% ""), reserved = TRUE)
}


runtime_transport_decode <- function(value) {
    utils::URLdecode(as.character(value %||% ""))
}


runtime_transport_extract_json_string <- function(raw, key) {
    raw <- as.character(raw %||% "")
    key <- as.character(key %||% "")

    if (!nzchar(raw) || !nzchar(key)) return("")

    pattern <- paste0('"', key, '":"([^"]*)"')
    match <- regexec(pattern, raw, perl = TRUE)
    parts <- regmatches(raw, match)[[1L]]

    if (length(parts) < 2L) return("")

    as.character(parts[[2L]] %||% "")
}


runtime_transport_value <- function(raw, key) {
    runtime_transport_decode(runtime_transport_extract_json_string(raw, key))
}


runtime_transport_number <- function(raw, key) {
    suppressWarnings(as.numeric(runtime_transport_value(raw, key)))
}


runtime_transport_integer <- function(raw, key) {
    suppressWarnings(as.integer(runtime_transport_value(raw, key)))
}


runtime_transport_flag <- function(raw, key, default = FALSE) {
    value <- runtime_transport_value(raw, key)

    if (!nzchar(value)) return(isTRUE(default))

    identical(value, "1")
}


runtime_transport_vector <- function(raw, key) {
    value <- runtime_transport_value(raw, key)

    if (!nzchar(value)) return(character(0))

    strsplit(value, "\037", fixed = FALSE)[[1L]]
}


runtime_transport_numeric_vector <- function(raw, key) {
    suppressWarnings(as.numeric(runtime_transport_vector(raw, key)))
}


runtime_transport_optional_value <- function(raw, key, supplied) {
    if (!isTRUE(supplied)) {
        return(NULL)
    }

    runtime_transport_value(raw, key)
}


runtime_transport_optional_number <- function(raw, key, supplied) {
    if (!isTRUE(supplied)) {
        return(NULL)
    }

    runtime_transport_number(raw, key)
}


runtime_transport_categories <- function(raw, supplied = FALSE) {
    values <- runtime_transport_vector(raw, "categoryValues")
    labels <- runtime_transport_vector(raw, "categoryLabels")
    missing <- runtime_transport_vector(raw, "categoryMissing")
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


runtime_transport_missing_range <- function(raw, supplied = FALSE) {
    minimum <- runtime_transport_value(raw, "missingRangeMin")
    maximum <- runtime_transport_value(raw, "missingRangeMax")

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


runtime_transport_dedicated_params <- function(raw) {
    has_type <- runtime_transport_flag(raw, "hasType")
    has_measure <- runtime_transport_flag(raw, "hasMeasure")
    has_label <- runtime_transport_flag(raw, "hasLabel")
    has_width <- runtime_transport_flag(raw, "hasWidth")
    has_decimals <- runtime_transport_flag(raw, "hasDecimals")
    has_align <- runtime_transport_flag(raw, "hasAlign")
    has_categories <- runtime_transport_flag(raw, "hasCategories")
    has_missing_range <- runtime_transport_flag(raw, "hasMissingRange")

    list(
        code = runtime_transport_value(raw, "code"),
        mode = runtime_transport_value(raw, "mode"),
        outputWidth = runtime_transport_integer(raw, "outputWidth"),
        timeoutMs = runtime_transport_number(raw, "timeoutMs"),
        sessionId = runtime_transport_number(raw, "sessionId"),
        diagnosticSession = runtime_transport_value(raw, "diagnosticSession"),
        topic = runtime_transport_value(raw, "topic"),
        package = runtime_transport_value(raw, "package"),
        prefix = runtime_transport_value(raw, "requestPrefix"),
        cursorColumn = runtime_transport_integer(raw, "cursorColumn"),
        includeInternals = runtime_transport_flag(raw, "includeInternals"),
        forceRefresh = runtime_transport_flag(raw, "forceRefresh"),
        path = runtime_transport_value(raw, "path"),
        reader = runtime_transport_value(raw, "reader"),
        nrows = runtime_transport_number(raw, "nrows"),
        binary = runtime_transport_flag(raw, "binary"),
        header = runtime_transport_flag(raw, "header", default = TRUE),
        rowNames = runtime_transport_integer(raw, "rowNames"),
        sep = runtime_transport_value(raw, "sep"),
        quote = runtime_transport_value(raw, "quote"),
        dec = runtime_transport_value(raw, "dec"),
        naStrings = runtime_transport_value(raw, "naStrings"),
        skip = runtime_transport_number(raw, "skip"),
        stripWhite = runtime_transport_flag(raw, "stripWhite"),
        commentChar = runtime_transport_value(raw, "commentChar"),
        fileEncoding = runtime_transport_value(raw, "fileEncoding"),
        parentId = runtime_transport_value(raw, "parentId"),
        outputCaptureName = runtime_transport_value(raw, "outputCaptureName"),
        outputCaptureSession = runtime_transport_value(raw, "outputCaptureSession"),
        promptId = runtime_transport_value(raw, "promptId"),
        reply = runtime_transport_value(raw, "reply"),
        names = runtime_transport_vector(raw, "names"),
        name = runtime_transport_value(raw, "name"),
        oldName = runtime_transport_value(raw, "oldName"),
        newName = runtime_transport_value(raw, "newName"),
        nextName = runtime_transport_value(raw, "nextName"),
        targetName = runtime_transport_value(raw, "targetName"),
        variableName = runtime_transport_value(raw, "variableName"),
        variableNames = runtime_transport_vector(raw, "variableNames"),
        xVariableName = runtime_transport_value(raw, "xVariableName"),
        yVariableName = runtime_transport_value(raw, "yVariableName"),
        solutionName = runtime_transport_value(raw, "solutionName"),
        branch = runtime_transport_value(raw, "branch"),
        model = runtime_transport_value(raw, "model"),
        ambiguity = runtime_transport_value(raw, "ambiguity"),
        title = runtime_transport_value(raw, "title"),
        legend = runtime_transport_flag(raw, "legend", default = TRUE),
        coreSelections = stats::setNames(
            runtime_transport_vector(raw, "coreSelectionValues"),
            runtime_transport_vector(raw, "coreSelectionNames")
        ),
        thresholds = runtime_transport_numeric_vector(raw, "thresholds"),
        thresholdNames = runtime_transport_vector(raw, "thresholdNames"),
        variant = runtime_transport_value(raw, "variant"),
        logistic = runtime_transport_flag(raw, "logistic"),
        ecdf = runtime_transport_flag(raw, "ecdf"),
        idm = runtime_transport_number(raw, "idm"),
        below = runtime_transport_number(raw, "below"),
        above = runtime_transport_number(raw, "above"),
        increasing = runtime_transport_flag(raw, "increasing", default = TRUE),
        bell = runtime_transport_flag(raw, "bell"),
        decreasing = runtime_transport_flag(raw, "decreasing"),
        naLast = runtime_transport_flag(raw, "naLast", default = TRUE),
        emptyLast = runtime_transport_flag(raw, "emptyLast", default = TRUE),
        type = runtime_transport_optional_value(raw, "type", has_type),
        measure = runtime_transport_optional_value(
            raw,
            "measure",
            has_measure
        ),
        label = runtime_transport_optional_value(raw, "label", has_label),
        categories = runtime_transport_categories(raw, has_categories),
        missingRange = runtime_transport_missing_range(raw, has_missing_range),
        width = runtime_transport_optional_number(raw, "width", has_width),
        decimals = runtime_transport_optional_number(
            raw,
            "decimals",
            has_decimals
        ),
        align = runtime_transport_optional_value(raw, "align", has_align),
        row = runtime_transport_number(raw, "row"),
        column = runtime_transport_value(raw, "column"),
        position = runtime_transport_value(raw, "position"),
        value = runtime_transport_value(raw, "value"),
        rowStart = runtime_transport_number(raw, "rowStart"),
        rowCount = runtime_transport_number(raw, "rowCount"),
        columnCount = runtime_transport_number(raw, "columnCount"),
        start = runtime_transport_number(raw, "start"),
        nth = runtime_transport_integer(raw, "nth"),
        count = runtime_transport_number(raw, "count"),
        columns = runtime_transport_vector(raw, "columns")
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


runtime_transport_validate_json_request <- function(raw, require_auth = TRUE) {
    # Both host adapters use compact, flat URL-encoded string fields.
    field <- "\"[A-Za-z][A-Za-z0-9]*\":\"[A-Za-z0-9_.!~*'()%+-]*\""
    envelope <- paste0("\\A\\{", field, "(?:,", field, ")*\\}\\z")
    if (!grepl(envelope, raw, perl = TRUE)) {
        return(FALSE)
    }
    if (grepl("%(?![A-Fa-f0-9]{2})", raw, perl = TRUE)) {
        return(FALSE)
    }
    if (grepl("%00", raw, fixed = TRUE)) {
        return(FALSE)
    }
    matches <- gregexpr('"[A-Za-z][A-Za-z0-9]*":', raw, perl = TRUE)
    keys <- regmatches(raw, matches)[[1L]]
    if (length(keys) > 256L) {
        return(FALSE)
    }
    for (index in seq_along(keys)) {
        if (base::match(keys[[index]], keys) != index) {
            return(FALSE)
        }
    }
    required <- c("prefix", "id", "method")
    if (isTRUE(require_auth)) {
        required <- c(required, "auth")
    }
    for (key in required) {
        if (!nzchar(runtime_transport_extract_json_string(raw, key))) {
            return(FALSE)
        }
    }
    TRUE
}


runtime_transport_decode_request <- function(raw, dedicated, require_auth = TRUE) {
    if (isTRUE(dedicated)) {
        if (!runtime_transport_validate_json_request(raw, require_auth)) {
            return(list(valid = FALSE, error = "invalid-request-envelope"))
        }
        prefix <- runtime_transport_value(raw, "prefix")

        if (!identical(prefix, "DMRUNTIME1")) {
            return(list(valid = FALSE, error = "invalid-request"))
        }

        request <- tryCatch(list(
            valid = TRUE,
            id = runtime_transport_value(raw, "id"),
            method = runtime_transport_value(raw, "method"),
            auth = runtime_transport_value(raw, "auth"),
            transportNonce = runtime_transport_value(raw, "transportNonce"),
            params = runtime_transport_dedicated_params(raw)
        ), error = function(error) {
            list(valid = FALSE, error = "invalid-request-encoding")
        })
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
            ",\"outputSequence\":", if (is.null(receipt$outputSequence)) "null" else
                as.character(receipt$outputSequence), "}"
        ))
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

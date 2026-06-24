runtime_capture_input <- function(code, parent_id) {
    warnings <- character(0)
    messages <- character(0)
    output <- character(0)

    result <- tryCatch({
        withCallingHandlers({
            trace(paste0("execute_input:eval-start parent=", parent_id))
            output <- utils::capture.output({
                value <- withVisible(eval(parse(text = code), envir = .GlobalEnv))

                if (isTRUE(value$visible)) {
                    print(value$value)
                }
            }, type = "output")
            trace(paste0("execute_input:eval-done parent=", parent_id))

            list(ok = TRUE)
        }, message = function(message) {
            messages <<- c(messages, conditionMessage(message))
            tryInvokeRestart("muffleMessage")
        }, warning = function(warning) {
            warnings <<- c(warnings, conditionMessage(warning))
            tryInvokeRestart("muffleWarning")
        }, error = function(error) {
            app_env$dialog_record_traceback()
        })
    }, interrupt = function(interrupt) {
        list(ok = TRUE, interrupted = TRUE)
    }, error = function(error) {
        list(ok = FALSE, error = conditionMessage(error))
    })

    list(
        ok = isTRUE(result$ok),
        interrupted = isTRUE(result$interrupted),
        error = as.character(result$error %||% ""),
        output = as.character(output),
        messages = as.character(messages),
        warnings = as.character(warnings)
    )
}


runtime_warning_text <- function(warnings) {
    if (!length(warnings)) return("")

    if (length(warnings) == 1L) {
        return(paste0("Warning message:\n", warnings[[1]]))
    }

    paste0(
        "Warning messages:\n",
        paste0(seq_along(warnings), ": ", warnings, collapse = "\n")
    )
}


runtime_emit_input_result <- function(result, code, parent_id, visible) {
    if (!isTRUE(visible)) return(invisible(NULL))

    output <- paste(result$output[nzchar(result$output)], collapse = "\n")
    messages <- paste(result$messages[nzchar(result$messages)], collapse = "")
    warnings <- filter_warnings(result$warnings, code)

    if (nzchar(output)) {
        emit_stream_event(output, "stdout", parent_id)
    }

    if (nzchar(messages)) {
        emit_stream_event(messages, "stdout", parent_id)
    }

    if (length(warnings)) {
        emit_stream_event(runtime_warning_text(warnings), "warning", parent_id)
        package_warnings <- warnings[
            vapply(warnings, is_package_loading_warning, logical(1))
        ]

        if (length(package_warnings)) {
            diagnostic <- package_loading_warning_diagnostics(
                code,
                package_warnings[[1]]
            )
            emit_stream_event(diagnostic, "stderr", parent_id)
            trace(gsub("\n", " | ", diagnostic, fixed = TRUE))
        }
    }

    invisible(NULL)
}


runtime_finish_input <- function(state, parent_id, visible, workspace = FALSE) {
    queue_completion_event(
        state,
        parent_id,
        emit_prompt_state = isTRUE(visible),
        emit_workspace = isTRUE(workspace),
        emit_plot = FALSE
    )
    current_activity_id <<- ""

    list(ok = TRUE, result = TRUE)
}


runtime_execute_input <- function(params) {
    code <- as.character(params$code %||% "")
    parent_id <- as.character(params$parentId %||% "")
    visible <- identical(as.character(params$mode %||% "interactive"), "interactive")

    if (!nzchar(code) || !nzchar(parent_id)) {
        return(list(ok = FALSE, error = "missing-input-or-parent"))
    }

    current_activity_id <<- parent_id
    trace(paste0(
        "execute_input:start parent=", parent_id,
        " visible=", visible
    ))

    remove_runtime_global_bindings()
    install_runtime_console_bindings()

    if (visible) {
        emit_input_event(code, parent_id)
    }

    previous_plot <- plot_signature()
    emit_state_event("busy", parent_id)
    result <- runtime_capture_input(code, parent_id)
    runtime_emit_input_result(result, code, parent_id, visible)

    if (result$interrupted) {
        return(runtime_finish_input("interrupted", parent_id, visible))
    }

    if (!result$ok) {
        if (visible) {
            emit_stream_event(
                paste0("Error: ", result$error %||% "execution failed"),
                "stderr",
                parent_id
            )
        }

        return(runtime_finish_input("error", parent_id, visible))
    }

    runtime_finish_input(
        "idle",
        parent_id,
        visible,
        code_may_mutate_workspace(code)
    )

    if (visible) {
        sync_httpgd_plot(parent_id, previous_plot)
    }

    trace(paste0("execute_input:done parent=", parent_id))

    list(ok = TRUE, result = TRUE)
}


runtime_reply_prompt <- function(params) {
    parent_id <- as.character(params$parentId %||% "")
    reply <- as.character(params$reply %||% "")

    if (!nzchar(reply)) {
        return(list(ok = FALSE, error = "missing-prompt-reply"))
    }

    pending_prompt_reply <<- list(parent_id = parent_id, reply = reply)

    list(ok = TRUE, result = TRUE)
}


runtime_completion_from_package <- function(package, include_internals) {
    exports <- tryCatch(
        getNamespaceExports(package),
        error = function(error) character(0)
    )
    internals <- if (isTRUE(include_internals)) {
        tryCatch(
            ls(getNamespace(package), all.names = TRUE),
            error = function(error) character(0)
        )
    } else {
        character(0)
    }

    list(
        exports = as.character(exports),
        internals = as.character(internals),
        symbols = character(0),
        items = list()
    )
}


runtime_completion_from_search_path <- function(prefix) {
    prefix <- as.character(prefix %||% "")
    symbols <- character(0)
    search_entries <- tryCatch(search(), error = function(error) character(0))

    for (entry in search_entries) {
        values <- tryCatch(
            ls(
                envir = as.environment(entry),
                all.names = identical(entry, ".GlobalEnv")
            ),
            error = function(error) character(0)
        )

        if (length(values)) {
            symbols <- c(symbols, as.character(values))
        }
    }

    symbols <- unique(symbols[nzchar(symbols)])

    if (nzchar(prefix)) {
        symbols <- symbols[startsWith(symbols, prefix)]
    }

    as.character(symbols)
}


runtime_completion_request <- function(params) {
    prefix <- as.character(params$prefix %||% "")
    package <- as.character(params$package %||% "")
    code <- as.character(params$code %||% "")
    cursor_column <- suppressWarnings(as.integer(
        params$cursorColumn %||% (nchar(code) + 1L)
    ))

    if (nzchar(code)) {
        path_context <- tryCatch(
            completion_path_context(code, cursor_column),
            error = function(error) NULL
        )

        if (!is.null(path_context)) {
            return(list(ok = TRUE, result = completion_path_result(path_context)))
        }

        member_context <- tryCatch(
            completion_dollar_context(code, cursor_column),
            error = function(error) NULL
        )

        if (!is.null(member_context)) {
            return(list(ok = TRUE, result = completion_dollar_result(member_context)))
        }
    }

    if (nzchar(package)) {
        return(list(
            ok = TRUE,
            result = runtime_completion_from_package(
                package,
                params$includeInternals
            )
        ))
    }

    symbols <- runtime_completion_from_search_path(prefix)

    list(
        ok = TRUE,
        result = list(
            exports = character(0),
            internals = character(0),
            symbols = as.character(symbols),
            items = list()
        )
    )
}


runtime_defined_functions <- function(code) {
    matches <- regmatches(
        code,
        gregexpr(
            "(?m)^\\s*([A-Za-z.][A-Za-z0-9._]*)\\s*(<-|=)\\s*function\\s*\\(",
            code,
            perl = TRUE
        )
    )[[1]]

    if (!length(matches) || identical(matches, character(0))) {
        return(character(0))
    }

    unique(sub(
        "^\\s*([A-Za-z.][A-Za-z0-9._]*).*$",
        "\\1",
        matches,
        perl = TRUE
    ))
}


runtime_unresolved_function_warnings <- function(expression, code) {
    parse_data <- tryCatch(
        utils::getParseData(expression),
        error = function(error) NULL
    )

    if (is.null(parse_data) || !is.data.frame(parse_data) || !nrow(parse_data)) {
        return(list())
    }

    calls <- parse_data[
        parse_data$token == "SYMBOL_FUNCTION_CALL",
        ,
        drop = FALSE
    ]

    if (!nrow(calls)) return(list())

    namespace_parents <- as.integer(parse_data$id[
        is.element(parse_data$token, c("NS_GET", "NS_GET_INT"))
    ])
    defined <- runtime_defined_functions(code)
    warnings <- list()

    for (index in seq_len(nrow(calls))) {
        call <- calls[index, , drop = FALSE]
        name <- as.character(call$text[[1]] %||% "")
        parent <- suppressWarnings(as.integer(call$parent[[1]] %||% 0L))

        if (
            !nzchar(name) ||
            is.element(name, defined) ||
            is.element(parent, namespace_parents)
        ) {
            next
        }

        exists_as_function <- tryCatch(
            exists(name, envir = .GlobalEnv, mode = "function", inherits = TRUE),
            error = function(error) FALSE
        )

        if (exists_as_function) next

        warnings[[length(warnings) + 1L]] <- list(
            name = name,
            message = paste0("Possible unresolved function: ", name),
            line = suppressWarnings(as.integer(call$line1[[1]] %||% 1L)),
            column = suppressWarnings(as.integer(call$col1[[1]] %||% 1L))
        )
    }

    if (!length(warnings)) return(warnings)

    keys <- vapply(warnings, function(warning) {
        paste(warning$name, warning$line, warning$column, sep = "::")
    }, character(1))

    warnings[!duplicated(keys)]
}


runtime_check_completeness <- function(params) {
    code <- as.character(params$code %||% "")
    result <- tryCatch({
        expression <- parse(text = code, keep.source = TRUE)
        list(
            state = "complete",
            message = "",
            warnings = runtime_unresolved_function_warnings(expression, code)
        )
    }, error = function(error) {
        message <- conditionMessage(error)
        incomplete <- grepl(
            "unexpected end of input|unexpected end of line|incomplete final line",
            message,
            ignore.case = TRUE
        )

        list(
            state = if (incomplete) "incomplete" else "invalid",
            message = message,
            warnings = list()
        )
    })

    list(ok = TRUE, result = result)
}


runtime_refresh_workspace_index <- function() {
    snapshot <- workspace_snapshot()
    workspace_index_set("last_snapshot", snapshot)
    workspace_index_set("last_state", workspace_state_from_snapshot(snapshot))

    snapshot
}


runtime_cached_workspace_snapshot <- function() {
    state <- workspace_index_get("last_state")

    if (is.null(state)) {
        return(runtime_refresh_workspace_index())
    }

    dataset_states <- state$datasetStates %||% list()
    data_frames <- lapply(dataset_states, function(dataset_state) {
        workspace_dataset_summary(NULL, dataset_state)
    })
    variables <- unname(state$variables %||% list())
    now <- runtime_time_ms()

    list(
        searchPath = state$searchPath %||% search(),
        dataframe = data_frames,
        select = state$select %||% list(
            list = character(0),
            matrix = character(0),
            vector = character(0)
        ),
        variables = variables,
        datasetStates = dataset_states,
        objectCount = as.integer(state$objectCount %||% length(variables)),
        diagnostics = list(
            snapshotStartedMs = now,
            snapshotCompletedMs = now,
            snapshotDurationMs = 0
        )
    )
}


runtime_workspace_remove <- function(params) {
    names <- as.character(params$names %||% character(0))
    names <- names[nzchar(names)]

    if (!length(names)) {
        return(list(ok = FALSE, error = "missing-workspace-names"))
    }

    targets <- intersect(names, ls(envir = .GlobalEnv, all.names = TRUE))

    if (length(targets)) {
        removed <- tryCatch({
            rm(list = targets, envir = .GlobalEnv)
            TRUE
        }, error = function(error) error)

        if (inherits(removed, "error")) {
            return(list(ok = FALSE, error = conditionMessage(removed)))
        }
    }

    list(ok = TRUE, result = runtime_refresh_workspace_index())
}


runtime_workspace_rename <- function(params) {
    old_name <- as.character(params$oldName %||% "")
    new_name <- as.character(params$newName %||% "")

    if (!nzchar(old_name) || !nzchar(new_name)) {
        return(list(ok = FALSE, error = "missing-workspace-rename-name"))
    }
    if (!exists(old_name, envir = .GlobalEnv, inherits = FALSE)) {
        return(list(ok = FALSE, error = "workspace-object-not-found"))
    }
    if (exists(new_name, envir = .GlobalEnv, inherits = FALSE)) {
        return(list(ok = FALSE, error = "workspace-object-name-conflict"))
    }

    renamed <- tryCatch({
        assign(
            new_name,
            get(old_name, envir = .GlobalEnv, inherits = FALSE),
            envir = .GlobalEnv
        )
        rm(list = old_name, envir = .GlobalEnv)
        TRUE
    }, error = function(error) error)

    if (inherits(renamed, "error")) {
        return(list(ok = FALSE, error = conditionMessage(renamed)))
    }

    list(ok = TRUE, result = runtime_refresh_workspace_index())
}


runtime_workspace_clear <- function() {
    names <- tryCatch(
        ls(envir = .GlobalEnv, all.names = FALSE),
        error = function(error) character(0)
    )

    if (length(names)) {
        removed <- tryCatch({
            rm(list = names, envir = .GlobalEnv)
            TRUE
        }, error = function(error) error)

        if (inherits(removed, "error")) {
            return(list(ok = FALSE, error = conditionMessage(removed)))
        }
    }

    list(ok = TRUE, result = runtime_refresh_workspace_index())
}


runtime_workspace_delta <- function() {
    change <- collect_workspace_update(workspace_index_get("last_state"))
    workspace_index_set(
        "last_state",
        change$state %||% workspace_index_get("last_state")
    )

    list(
        ok = TRUE,
        result = change$update %||% list(
            added = list(),
            updated = list(),
            removed = character(0),
            objectCount = 0L,
            updatedAt = 0
        )
    )
}


runtime_dataset_schema <- function(params) {
    result <- workspace_dataset_schema(params$name %||% "")

    if (!isTRUE(result$ok)) return(result)

    columns <- result$result$columns %||% character(0)
    result$result$columns <- NULL
    result$result_json <- paste0(
        "{",
        "\"name\":", json_str(result$result$name %||% ""),
        ",\"rowCount\":", json_num(result$result$rowCount %||% 0),
        ",\"columnCount\":", json_num(result$result$columnCount %||% 0),
        ",\"columns\":[", paste(as.character(columns), collapse = ","), "]",
        "}"
    )

    result
}


runtime_dispatch_dataset_read <- function(method, params) {
    switch(method,
        "workspace.dataset_schema" = runtime_dataset_schema(params),
        "workspace.dataset_content" = workspace_dataset_content(
            params$name %||% "",
            params$rowStart %||% 1L,
            params$rowCount %||% 50L,
            params$columns %||% character(0),
            params$columnCount %||% 8L
        ),
        "workspace.dataset_filter_mask" = workspace_dataset_filter_mask(
            params$name %||% "",
            params$code %||% "",
            params$rowStart %||% 1L,
            params$rowCount %||% 50L
        ),
        "workspace.dataset_variables" = workspace_dataset_variables(
            params$name %||% ""
        ),
        "workspace.dataset_variables_batch" = workspace_dataset_variables_batch(
            params$name %||% "",
            params$start %||% 1L,
            params$count %||% 20L
        ),
        "workspace.dataset_values" = workspace_dataset_values(
            params$name %||% "",
            params$variableName %||% ""
        ),
        "workspace.import_file_preview" = workspace_import_file_preview(
            params$path %||% "",
            params$reader %||% "read.table",
            params$nrows %||% 8L,
            params$binary %||% FALSE,
            params$header %||% TRUE,
            params$rowNames %||% 0L,
            params$sep,
            params$quote,
            params$dec %||% ".",
            params$naStrings %||% "NA",
            params$skip %||% 0L,
            params$stripWhite %||% FALSE,
            params$commentChar %||% "#",
            params$fileEncoding %||% ""
        ),
        NULL
    )
}


runtime_dispatch_product <- function(method, params) {
    if (!exists("runtime_dispatch_product_method", inherits = TRUE)) {
        return(NULL)
    }

    runtime_dispatch_product_method(method, params)
}


runtime_dispatch_dataset_write <- function(method, params) {
    switch(method,
        "workspace.dataset_update_column_name" = workspace_dataset_update_column_name(
            params$name %||% "",
            params$column %||% "",
            params$nextName %||% ""
        ),
        "workspace.dataset_insert_column" = workspace_dataset_insert_column(
            params$name %||% "",
            params$column %||% "",
            params$nextName %||% "",
            params$position %||% "after"
        ),
        "workspace.dataset_remove_column" = workspace_dataset_remove_column(
            params$name %||% "",
            params$column %||% ""
        ),
        "workspace.dataset_update_row_name" = workspace_dataset_update_row_name(
            params$name %||% "",
            params$row %||% 0L,
            params$nextName %||% ""
        ),
        "workspace.dataset_insert_row" = workspace_dataset_insert_row(
            params$name %||% "",
            params$row %||% 0L,
            params$nextName %||% "",
            params$position %||% "after"
        ),
        "workspace.dataset_remove_row" = workspace_dataset_remove_row(
            params$name %||% "",
            params$row %||% 0L
        ),
        "workspace.dataset_update_variable" = workspace_dataset_update_variable(
            params$name %||% "",
            params$variableName %||% "",
            params$type,
            params$measure,
            params$label,
            params$width,
            params$decimals,
            params$align,
            params$categories,
            params$missingRange
        ),
        "workspace.dataset_update_cell" = workspace_dataset_update_cell(
            params$name %||% "",
            params$row %||% 0L,
            params$column %||% "",
            params$value %||% ""
        ),
        "workspace.dataset_sort_rows" = workspace_dataset_sort_rows(
            params$name %||% "",
            params$column %||% "",
            params$decreasing %||% FALSE,
            params$naLast %||% TRUE,
            params$emptyLast %||% TRUE
        ),
        NULL
    )
}


runtime_workspace_object_names <- function() {
    names <- tryCatch(
        ls(envir = .GlobalEnv, all.names = FALSE),
        error = function(error) character(0)
    )

    names[
        !grepl("^\\.app_runtime_control", names) &
        !is.element(names, "dialog_emit")
    ]
}


runtime_workspace_file_result <- function(path, objects) {
    result <- list(path = path, objects = as.character(objects))
    result_json <- paste0(
        "{",
        "\"path\":", json_str(path),
        ",\"objects\":", json_strv(objects),
        "}"
    )

    list(ok = TRUE, result = result, result_json = result_json)
}


runtime_set_working_directory <- function(params) {
    target <- as.character(params$path %||% "")

    if (!nzchar(target)) return(list(ok = FALSE, error = "missing-working-directory"))
    if (!dir.exists(target)) return(list(ok = FALSE, error = "working-directory-not-found"))

    previous_path <- tryCatch(getwd(), error = function(error) "")
    changed <- tryCatch({
        setwd(target)
        TRUE
    }, error = function(error) error)

    if (inherits(changed, "error")) {
        return(list(ok = FALSE, error = conditionMessage(changed)))
    }

    path <- normalizePath(getwd(), winslash = "/", mustWork = FALSE)
    result <- list(path = path, previousPath = previous_path)
    result_json <- paste0(
        "{\"path\":", json_str(path),
        ",\"previousPath\":", json_str(previous_path), "}"
    )

    list(ok = TRUE, result = result, result_json = result_json)
}


runtime_run_script_file <- function(params) {
    target <- as.character(params$path %||% "")

    if (!nzchar(target)) return(list(ok = FALSE, error = "missing-script-file"))
    if (!file.exists(target)) return(list(ok = FALSE, error = "script-file-not-found"))

    information <- tryCatch(file.info(target), error = function(error) NULL)

    if (is.null(information) || !isTRUE(information$isdir == FALSE)) {
        return(list(ok = FALSE, error = "script-path-not-file"))
    }

    path <- normalizePath(target, winslash = "/", mustWork = TRUE)
    sourced <- tryCatch({
        source(path, local = .GlobalEnv, echo = FALSE, verbose = FALSE, print.eval = FALSE)
        TRUE
    }, error = function(error) error)

    if (inherits(sourced, "error")) {
        return(list(ok = FALSE, error = conditionMessage(sourced)))
    }

    runtime_refresh_workspace_index()
    result <- list(path = path)

    list(
        ok = TRUE,
        result = result,
        result_json = paste0("{\"path\":", json_str(path), "}")
    )
}


runtime_workspace_fingerprint <- function() {
    objects <- runtime_workspace_object_names()
    file <- tempfile("dialogforge-workspace-", fileext = ".RData")

    on.exit(unlink(file), add = TRUE)

    saved <- tryCatch({
        save(
            list = objects,
            file = file,
            envir = .GlobalEnv,
            ascii = FALSE,
            version = 3L,
            compress = FALSE
        )
        TRUE
    }, error = function(error) error)

    if (inherits(saved, "error")) {
        return(list(ok = FALSE, error = conditionMessage(saved)))
    }

    fingerprint <- unname(as.character(tools::md5sum(file)[[1L]]))
    result <- list(fingerprint = fingerprint, objects = objects)
    result_json <- paste0(
        "{\"fingerprint\":", json_str(fingerprint),
        ",\"objects\":", json_strv(objects), "}"
    )

    list(ok = TRUE, result = result, result_json = result_json)
}


runtime_save_workspace_file <- function(params) {
    target <- as.character(params$path %||% "")

    if (!nzchar(target)) return(list(ok = FALSE, error = "missing-workspace-file"))

    path <- normalizePath(target, winslash = "/", mustWork = FALSE)

    if (!dir.exists(dirname(path))) {
        return(list(ok = FALSE, error = "workspace-directory-not-found"))
    }

    objects <- runtime_workspace_object_names()
    saved <- tryCatch({
        save(list = objects, file = path, envir = .GlobalEnv)
        TRUE
    }, error = function(error) error)

    if (inherits(saved, "error")) {
        return(list(ok = FALSE, error = conditionMessage(saved)))
    }

    runtime_workspace_file_result(path, objects)
}


runtime_load_workspace_file <- function(params) {
    target <- as.character(params$path %||% "")

    if (!nzchar(target)) return(list(ok = FALSE, error = "missing-workspace-file"))
    if (!file.exists(target)) return(list(ok = FALSE, error = "workspace-file-not-found"))

    information <- tryCatch(file.info(target), error = function(error) NULL)

    if (is.null(information) || !isTRUE(information$isdir == FALSE)) {
        return(list(ok = FALSE, error = "workspace-path-not-file"))
    }

    path <- normalizePath(target, winslash = "/", mustWork = TRUE)
    loaded <- tryCatch(
        load(path, envir = .GlobalEnv),
        error = function(error) error
    )

    if (inherits(loaded, "error")) {
        return(list(ok = FALSE, error = conditionMessage(loaded)))
    }

    runtime_refresh_workspace_index()
    runtime_workspace_file_result(path, as.character(loaded))
}


runtime_qca_truth_table_json <- function(name, value) {
    options <- value$options %||% list()
    conditions <- options$conditions %||% character(0)
    outcome <- as.character(options$outcome %||% "")
    table <- value$tt %||% data.frame()
    id <- if (is.data.frame(table) && is.element("OUT", names(table))) {
        rownames(table)
    }
    else {
        character(0)
    }
    out <- if (is.data.frame(table) && is.element("OUT", names(table))) {
        as.character(table[["OUT"]])
    }
    else {
        character(0)
    }

    paste0(
        "{\"name\":", json_str(name), ",",
        "\"options\":{",
        "\"outcome\":", json_str(outcome), ",",
        "\"conditions\":", json_strv(as.character(conditions)),
        "},",
        "\"id\":", json_strv(as.character(id)), ",",
        "\"out\":", json_strv(as.character(out)), ",",
        "\"cases\":", json_strv(as.character(value$cases %||% character(0))),
        "}"
    )
}


runtime_qca_truth_tables <- function() {
    names <- ls(envir = .GlobalEnv, all.names = FALSE)
    entries <- character(0)

    for (name in names) {
        value <- get(name, envir = .GlobalEnv, inherits = FALSE)

        if (!is.element("QCA_tt", class(value))) {
            next
        }

        entries <- c(entries, runtime_qca_truth_table_json(name, value))
    }

    list(
        ok = TRUE,
        result_json = paste0("[", paste(entries, collapse = ","), "]")
    )
}


runtime_dispatch_service <- function(method, params) {
    switch(method,
        "execute_input" = runtime_execute_input(params),
        "reply_prompt" = runtime_reply_prompt(params),
        "evaluate_code" = evaluate_code_result(as.character(params$code %||% "")),
        "completion.request" = runtime_completion_request(params),
        "check_completeness" = runtime_check_completeness(params),
        "get_working_directory" = list(
            ok = TRUE,
            result = list(path = normalizePath(getwd(), winslash = "/", mustWork = FALSE))
        ),
        "load_workspace" = runtime_load_workspace_file(params),
        "show_help_topic" = list(
            ok = TRUE,
            result = help_matches(
                as.character(params$topic %||% ""),
                if (nzchar(as.character(params$package %||% ""))) {
                    as.character(params$package)
                } else {
                    NULL
                }
            )
        ),
        "search_help_topic" = list(
            ok = TRUE,
            result = help_search_matches(as.character(params$topic %||% ""))
        ),
        "workspace.snapshot" = list(
            ok = TRUE,
            result = if (isTRUE(params$forceRefresh)) {
                runtime_refresh_workspace_index()
            }
            else {
                runtime_cached_workspace_snapshot()
            }
        ),
        "workspace.remove" = runtime_workspace_remove(params),
        "workspace.rename" = runtime_workspace_rename(params),
        "workspace.clear" = runtime_workspace_clear(),
        "workspace.update" = runtime_workspace_delta(),
        "workspace.inspect" = workspace_inspect(params$name %||% ""),
        "runtime.set_working_directory" = runtime_set_working_directory(params),
        "runtime.run_script_file" = runtime_run_script_file(params),
        "runtime.workspace_fingerprint" = runtime_workspace_fingerprint(),
        "runtime.save_workspace_file" = runtime_save_workspace_file(params),
        "runtime.load_workspace_file" = runtime_load_workspace_file(params),
        "workspace.truth_tables" = runtime_qca_truth_tables(),
        NULL
    )
}


eval_method <- function(method, params) {
    result <- runtime_dispatch_service(method, params)

    if (!is.null(result)) return(result)

    result <- runtime_dispatch_dataset_read(method, params)

    if (!is.null(result)) return(result)

    result <- runtime_dispatch_dataset_write(method, params)

    if (!is.null(result)) return(result)

    result <- runtime_dispatch_product(method, params)

    if (!is.null(result)) return(result)

    list(ok = FALSE, error = paste0("unsupported-method:", method))
}

runtime_event_parent_id <- function(parent_id = "") {
    as.character(parent_id %||% current_activity_id %||% "")
}


runtime_event_identity <- function(type) {
    event_seq <<- as.integer(event_seq) + 1L

    list(
        id = paste0(type, "_", as.character(event_seq)),
        when = format(Sys.time(), "%Y-%m-%dT%H:%M:%OS3Z", tz = "UTC")
    )
}


runtime_event_payload <- function(type, fields, parent_id = NULL) {
    identity <- runtime_event_identity(type)
    parts <- c(
        paste0("\"type\":", json_str(type)),
        paste0("\"id\":", json_str(identity$id))
    )

    if (!is.null(parent_id)) {
        parts <- c(parts, paste0("\"parent_id\":", json_str(parent_id)))
    }

    parts <- c(
        parts,
        paste0("\"when\":", json_str(identity$when)),
        fields
    )

    paste0("{", paste(parts, collapse = ","), "}")
}


write_event <- function(line) {
    if (!nzchar(events_path)) return(invisible(NULL))

    safe(cat(
        paste0(as.character(line %||% ""), "\n"),
        file = events_path,
        append = TRUE
    ))

    invisible(NULL)
}


push_event <- function(line) {
    line <- as.character(line %||% "")

    if (!nzchar(line)) return(invisible(NULL))

    if (isTRUE(live_events_enabled) && !is.null(client)) {
        safe(writeLines(line, client, useBytes = TRUE))
        safe(flush(client))

        return(invisible(NULL))
    }

    write_event(line)

    invisible(NULL)
}


emit_input_event <- function(code, parent_id = "") {
    code <- as.character(code %||% "")
    parent_id <- runtime_event_parent_id(parent_id)

    if (!nzchar(code) || !nzchar(parent_id)) return(invisible(NULL))

    push_event(runtime_event_payload(
        "input",
        paste0("\"code\":", json_str(code)),
        parent_id
    ))
}


emit_stream_event <- function(text, name = "stdout", parent_id = "") {
    text <- as.character(text %||% "")

    if (!nzchar(text)) return(invisible(NULL))

    parent_id <- runtime_event_parent_id(parent_id)
    fields <- c(
        paste0("\"name\":", json_str(tolower(as.character(name %||% "stdout")))),
        paste0("\"text\":", json_str(text))
    )

    push_event(runtime_event_payload("stream", fields, parent_id))
}


emit_plot_event <- function(
    status = "available",
    url = "",
    viewer_url = "",
    parent_id = "",
    count = 0L,
    upid = "",
    message = ""
) {
    status <- as.character(status %||% "")

    if (!nzchar(status)) return(invisible(NULL))

    count <- suppressWarnings(as.integer(count %||% 0L))

    if (!is.finite(count) || is.na(count)) {
        count <- 0L
    }

    fields <- c(
        paste0("\"status\":", json_str(status)),
        paste0("\"url\":", json_str(as.character(url %||% ""))),
        paste0("\"viewer_url\":", json_str(as.character(viewer_url %||% ""))),
        paste0("\"count\":", json_num(count)),
        paste0("\"upid\":", json_str(as.character(upid %||% ""))),
        paste0("\"backend\":", json_str(as.character(plot_backend %||% "none"))),
        paste0("\"message\":", json_str(as.character(message %||% "")))
    )

    push_event(runtime_event_payload(
        "plot",
        fields,
        runtime_event_parent_id(parent_id)
    ))
}


emit_state_event <- function(state, parent_id = "") {
    state <- as.character(state %||% "")

    if (!nzchar(state)) return(invisible(NULL))

    push_event(runtime_event_payload(
        "state",
        paste0("\"state\":", json_str(state)),
        runtime_event_parent_id(parent_id)
    ))
}


emit_completion_event <- function(state, parent_id = "") {
    state <- as.character(state %||% "")
    parent_id <- runtime_event_parent_id(parent_id)

    if (!nzchar(state) || !nzchar(parent_id)) return(invisible(NULL))

    push_event(runtime_event_payload(
        "completion",
        paste0("\"state\":", json_str(state)),
        parent_id
    ))
}


emit_workspace_event <- function(snapshot = NULL, parent_id = "") {
    snapshot <- snapshot %||% workspace_snapshot()

    push_event(runtime_event_payload(
        "workspace",
        paste0("\"snapshot\":", json_workspace(snapshot)),
        runtime_event_parent_id(parent_id)
    ))
}


runtime_workspace_changed_rows_json <- function(rows) {
    rows <- as.integer(rows %||% integer(0))

    if (!length(rows)) return("[]")

    paste0(
        "[",
        paste(vapply(rows, json_num, character(1)), collapse = ","),
        "]"
    )
}


runtime_workspace_changed_dataset_json <- function(change) {
    fields <- c(
        paste0("\"name\":", json_str(as.character(change$name %||% ""))),
        paste0("\"kind\":", json_str(as.character(change$kind %||% ""))),
        paste0("\"columns\":", json_strv(as.character(change$columns %||% character(0)))),
        paste0("\"rows\":", runtime_workspace_changed_rows_json(change$rows)),
        paste0("\"rowCount\":", json_num(change$rowCount %||% 0)),
        paste0("\"columnCount\":", json_num(change$columnCount %||% 0)),
        paste0("\"columnIndex\":", json_num(change$columnIndex %||% 0)),
        paste0("\"schemaChanged\":", json_bool(change$schemaChanged))
    )

    paste0("{", paste(fields, collapse = ","), "}")
}


runtime_workspace_changed_datasets_json <- function(changes) {
    changes <- changes %||% list()

    if (!length(changes)) return("[]")

    paste0(
        "[",
        paste(
            vapply(changes, runtime_workspace_changed_dataset_json, character(1)),
            collapse = ","
        ),
        "]"
    )
}


runtime_workspace_datasets_json <- function(datasets) {
    datasets <- datasets %||% list(
        added = character(0),
        removed = character(0),
        changed = list()
    )
    fields <- c(
        paste0("\"added\":", json_strv(as.character(datasets$added %||% character(0)))),
        paste0("\"removed\":", json_strv(as.character(datasets$removed %||% character(0)))),
        paste0("\"changed\":", runtime_workspace_changed_datasets_json(datasets$changed))
    )

    paste0("{", paste(fields, collapse = ","), "}")
}


json_workspace_update <- function(update) {
    count <- suppressWarnings(as.integer(update$objectCount %||% 0L))

    if (!is.finite(count) || is.na(count)) {
        count <- 0L
    }

    fields <- c(
        paste0("\"added\":", json_variables(update$added %||% list())),
        paste0("\"updated\":", json_variables(update$updated %||% list())),
        paste0("\"removed\":", json_strv(as.character(update$removed %||% character(0)))),
        paste0("\"datasets\":", runtime_workspace_datasets_json(update$datasets)),
        paste0("\"objectCount\":", as.character(count)),
        paste0("\"updatedAt\":", json_num(update$updatedAt %||% 0))
    )

    paste0("{", paste(fields, collapse = ","), "}")
}


runtime_workspace_variable_signature <- function(variable) {
    paste(
        as.character(variable$access_key %||% ""),
        as.character(variable$display_name %||% ""),
        as.character(variable$display_value %||% ""),
        as.character(variable$display_type %||% ""),
        as.character(variable$type_info %||% ""),
        as.character(variable$kind %||% ""),
        as.character(variable$length %||% ""),
        as.character(variable$has_children %||% ""),
        as.character(variable$has_viewer %||% ""),
        sep = "\r"
    )
}


runtime_workspace_variables_by_key <- function(variables) {
    keys <- vapply(variables, function(variable) {
        as.character(variable$access_key %||% "")
    }, character(1))

    list(
        keys = keys,
        positions = stats::setNames(seq_along(keys), keys)
    )
}


workspace_update <- function(previous, current) {
    previous_variables <- previous$variables %||% list()
    current_variables <- current$variables %||% list()
    previous_index <- runtime_workspace_variables_by_key(previous_variables)
    current_index <- runtime_workspace_variables_by_key(current_variables)
    added <- list()
    updated <- list()

    for (key in current_index$keys) {
        if (!nzchar(key)) next

        current_variable <- current_variables[[current_index$positions[[key]]]]

        if (!is.element(key, previous_index$keys)) {
            added[[length(added) + 1L]] <- current_variable
            next
        }

        previous_variable <- previous_variables[[previous_index$positions[[key]]]]

        if (!identical(
            runtime_workspace_variable_signature(previous_variable),
            runtime_workspace_variable_signature(current_variable)
        )) {
            updated[[length(updated) + 1L]] <- current_variable
        }
    }

    removed <- previous_index$keys[
        nzchar(previous_index$keys) &
        !vapply(previous_index$keys, is.element, logical(1), current_index$keys)
    ]

    list(
        added = added,
        updated = updated,
        removed = as.character(removed),
        objectCount = as.integer(current$objectCount %||% length(current_variables)),
        updatedAt = as.numeric(floor(as.numeric(Sys.time()) * 1000))
    )
}


emit_workspace_update_event <- function(update = NULL, parent_id = "") {
    update <- update %||% list(
        added = list(),
        updated = list(),
        removed = character(0),
        objectCount = 0L,
        updatedAt = 0
    )

    push_event(runtime_event_payload(
        "workspace_update",
        paste0("\"update\":", json_workspace_update(update)),
        runtime_event_parent_id(parent_id)
    ))
}


emit_session_event <- function(phase) {
    phase <- as.character(phase %||% "")

    if (!nzchar(phase)) return(invisible(NULL))

    push_event(runtime_event_payload(
        "session",
        paste0("\"phase\":", json_str(phase))
    ))
}


emit_prompt_event <- function(prompt, password = FALSE, parent_id = "") {
    prompt <- as.character(prompt %||% "")

    if (!nzchar(prompt)) return(invisible(NULL))

    fields <- c(
        paste0("\"prompt\":", json_str(prompt)),
        paste0("\"password\":", json_bool(password))
    )

    push_event(runtime_event_payload(
        "prompt",
        fields,
        runtime_event_parent_id(parent_id)
    ))
}


emit_prompt_state_event <- function() {
    input_prompt <- tryCatch(
        getOption("prompt"),
        error = function(error) "> "
    )
    continuation_prompt <- tryCatch(
        getOption("continue"),
        error = function(error) "+ "
    )
    fields <- c(
        paste0("\"inputPrompt\":", json_str(as.character(input_prompt %||% "> "))),
        paste0(
            "\"continuationPrompt\":",
            json_str(as.character(continuation_prompt %||% "+ "))
        )
    )

    push_event(runtime_event_payload("prompt_state", fields))
}


queue_completion_event <- function(
    state,
    parent_id = "",
    emit_prompt_state = TRUE,
    emit_workspace = FALSE,
    emit_plot = FALSE
) {
    state <- as.character(state %||% "")
    parent_id <- runtime_event_parent_id(parent_id)

    if (!nzchar(state) || !nzchar(parent_id)) return(invisible(NULL))

    workspace_change <- NULL

    if (isTRUE(emit_workspace)) {
        workspace_change <- collect_workspace_update(
            workspace_index_get("last_state")
        )
    }

    completion_queue[[length(completion_queue) + 1L]] <<- list(
        state = state,
        parent_id = parent_id,
        emit_prompt_state = isTRUE(emit_prompt_state),
        emit_workspace = isTRUE(emit_workspace),
        emit_plot = isTRUE(emit_plot),
        workspace_update = workspace_change
    )

    invisible(TRUE)
}


runtime_emit_queued_workspace_update <- function(item, parent_id) {
    if (!isTRUE(item$emit_workspace)) return(invisible(NULL))

    workspace_change <- item$workspace_update %||%
        collect_workspace_update(workspace_index_get("last_state"))

    emit_workspace_update_event(
        workspace_change$update %||% list(),
        parent_id
    )
    workspace_index_set(
        "last_state",
        workspace_change$state %||% workspace_index_get("last_state")
    )

    invisible(NULL)
}


flush_completion_queue <- function() {
    queue <- completion_queue

    if (!length(queue)) return(invisible(NULL))

    completion_queue <<- list()

    for (item in queue) {
        parent_id <- as.character(item$parent_id %||% "")
        state <- as.character(item$state %||% "")

        if (!nzchar(parent_id) || !nzchar(state)) next

        runtime_emit_queued_workspace_update(item, parent_id)

        if (isTRUE(item$emit_plot)) {
            sync_httpgd_plot(parent_id)
        }

        if (isTRUE(item$emit_prompt_state)) {
            emit_prompt_state_event()
        }

        emit_completion_event(state, parent_id)
    }

    invisible(TRUE)
}

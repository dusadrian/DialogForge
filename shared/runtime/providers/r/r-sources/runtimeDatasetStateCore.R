runtime_time_ms <- function() {
    as.numeric(floor(as.numeric(Sys.time()) * 1000))
}


runtime_global_names <- function() {
    ls(envir = .GlobalEnv, all.names = FALSE)
}


runtime_global_object <- function(name) {
    tryCatch(
        get(name, envir = .GlobalEnv, inherits = FALSE),
        error = function(error) NULL
    )
}


dataset_changed_columns <- function(previous_columns, current_columns) {
    previous_columns <- as.character(previous_columns %||% character(0))
    current_columns <- as.character(current_columns %||% character(0))

    if (!length(previous_columns) && !length(current_columns)) {
        return(character(0))
    }

    if (identical(previous_columns, current_columns)) {
        return(character(0))
    }

    changed <- union(
        setdiff(previous_columns, current_columns),
        setdiff(current_columns, previous_columns)
    )

    if (!length(changed)) {
        changed <- current_columns
    }

    unique(as.character(changed %||% character(0)))
}


dataset_column_rename_change <- function(
    name,
    previous_columns,
    current_columns,
    column_count
) {
    previous_columns <- as.character(previous_columns %||% character(0))
    current_columns <- as.character(current_columns %||% character(0))

    if (!length(previous_columns) || !length(current_columns)) {
        return(NULL)
    }

    if (length(previous_columns) != length(current_columns)) {
        return(NULL)
    }

    changed_index <- which(previous_columns != current_columns)

    if (length(changed_index) != 1L) {
        return(NULL)
    }

    changed_index <- as.integer(changed_index[[1]])

    if (!identical(previous_columns[-changed_index], current_columns[-changed_index])) {
        return(NULL)
    }

    list(
        name = name,
        kind = "dataset_column_renamed",
        columns = as.character(c(
            previous_columns[[changed_index]],
            current_columns[[changed_index]]
        )),
        columnIndex = changed_index,
        columnCount = as.integer(column_count %||% length(current_columns)),
        schemaChanged = FALSE
    )
}


dataset_removed_column_index <- function(previous_columns, current_columns) {
    for (index in seq_along(previous_columns)) {
        if (identical(previous_columns[-index], current_columns)) {
            return(as.integer(index))
        }
    }

    NA_integer_
}


dataset_column_removed_change <- function(
    name,
    previous_columns,
    current_columns,
    column_count
) {
    previous_columns <- as.character(previous_columns %||% character(0))
    current_columns <- as.character(current_columns %||% character(0))

    if (
        !length(previous_columns) ||
        length(current_columns) != length(previous_columns) - 1L
    ) {
        return(NULL)
    }

    removed_index <- dataset_removed_column_index(
        previous_columns,
        current_columns
    )

    if (
        !is.finite(removed_index) ||
        is.na(removed_index) ||
        removed_index < 1L
    ) {
        return(NULL)
    }

    list(
        name = name,
        kind = "dataset_column_removed",
        columns = as.character(previous_columns[[removed_index]]),
        columnIndex = removed_index,
        columnCount = as.integer(column_count %||% length(current_columns)),
        schemaChanged = FALSE
    )
}


dataset_attribute <- function(column, name) {
    tryCatch(
        attr(column, name, exact = TRUE),
        error = function(error) NULL
    )
}


dataset_labels_signature <- function(labels) {
    if (is.null(labels) || !length(labels)) {
        return("")
    }

    label_names <- names(labels)

    if (is.null(label_names) || !length(label_names)) {
        label_names <- rep.int("", length(labels))
    }

    paste(
        paste(
            as.character(label_names),
            as.character(labels),
            sep = "\f"
        ),
        collapse = "\r"
    )
}


dataset_column_metadata_signature <- function(column) {
    classes <- tryCatch(
        as.character(class(column) %||% typeof(column)),
        error = function(error) character(0)
    )
    labels <- dataset_attribute(column, "labels")

    paste(
        paste(classes, collapse = "/"),
        as.character(dataset_attribute(column, "label")[[1]] %||% ""),
        dataset_labels_signature(labels),
        paste(
            as.character(dataset_attribute(column, "na_values") %||% character(0)),
            collapse = "\r"
        ),
        paste(
            as.character(dataset_attribute(column, "na_range") %||% character(0)),
            collapse = "\r"
        ),
        as.character(dataset_attribute(column, "measurement")[[1]] %||% ""),
        as.character(dataset_attribute(column, "width")[[1]] %||% ""),
        as.character(dataset_attribute(column, "decimals")[[1]] %||% ""),
        as.character(dataset_attribute(column, "align")[[1]] %||% ""),
        sep = "\r"
    )
}


dataset_column_hash <- function(column) {
    workspace_value_hash(column)
}


dataset_column_flags <- function(column) {
    if (!exists("workspace_dataset_item_flags", mode = "function")) {
        return(list())
    }

    tryCatch(
        workspace_dataset_item_flags(column),
        error = function(error) list()
    )
}


dataset_column_names <- function(value) {
    tryCatch(
        as.character(colnames(value) %||% character(0)),
        error = function(error) character(0)
    )
}


dataset_dimension_count <- function(value) {
    count <- suppressWarnings(as.integer(value))

    if (!is.finite(count) || is.na(count) || count < 0L) {
        return(0L)
    }

    count
}


dataset_state_current <- function(name, value, previous_dataset = NULL) {
    if (!is.data.frame(value)) {
        return(NULL)
    }

    object_hash <- tryCatch(
        workspace_value_hash(value),
        error = function(error) ""
    )

    if (
        !is.null(previous_dataset) &&
        nzchar(object_hash) &&
        identical(
            as.character(previous_dataset$objectHash %||% ""),
            object_hash
        )
    ) {
        previous_dataset$name <- as.character(name %||% "")
        return(previous_dataset)
    }

    columns <- dataset_column_names(value)
    previous_metadata <- previous_dataset$columnMetaSig %||% list()
    previous_hashes <- previous_dataset$columnHash %||% list()
    previous_flags <- previous_dataset$columnFlags %||% list()
    column_metadata <- list()
    column_hashes <- list()
    column_flags <- list()

    for (column_name in columns) {
        column <- value[[column_name]]
        current_hash <- tryCatch(
            dataset_column_hash(column),
            error = function(error) ""
        )

        column_hashes[[column_name]] <- current_hash

        if (
            nzchar(current_hash) &&
            identical(
                current_hash,
                as.character(previous_hashes[[column_name]] %||% "")
            ) &&
            !is.null(previous_metadata[[column_name]]) &&
            !is.null(previous_flags[[column_name]])
        ) {
            column_metadata[[column_name]] <- previous_metadata[[column_name]]
            column_flags[[column_name]] <- previous_flags[[column_name]]
        }
        else {
            column_metadata[[column_name]] <- tryCatch(
                dataset_column_metadata_signature(column),
                error = function(error) ""
            )
            column_flags[[column_name]] <- dataset_column_flags(column)
        }
    }

    list(
        name = as.character(name %||% ""),
        rowCount = dataset_dimension_count(nrow(value)),
        columnCount = dataset_dimension_count(length(columns)),
        columns = columns,
        columnsSig = paste(columns, collapse = "\r"),
        objectHash = as.character(object_hash %||% ""),
        columnHash = column_hashes,
        columnMetaSig = column_metadata,
        columnFlags = column_flags
    )
}


dataset_changed_value_columns <- function(previous_dataset, current_dataset) {
    previous_columns <- as.character(previous_dataset$columns %||% character(0))
    current_columns <- as.character(current_dataset$columns %||% character(0))

    if (!identical(previous_columns, current_columns)) {
        return(character(0))
    }

    previous_hashes <- previous_dataset$columnHash %||% list()
    current_hashes <- current_dataset$columnHash %||% list()
    changed <- current_columns[vapply(
        current_columns,
        function(column_name) {
            !identical(
                as.character(previous_hashes[[column_name]] %||% ""),
                as.character(current_hashes[[column_name]] %||% "")
            )
        },
        logical(1)
    )]

    unique(as.character(changed %||% character(0)))
}


dataset_changed_variable_meta <- function(previous_dataset, current_dataset) {
    previous_columns <- as.character(previous_dataset$columns %||% character(0))
    current_columns <- as.character(current_dataset$columns %||% character(0))

    if (!identical(previous_columns, current_columns)) {
        return(character(0))
    }

    previous_metadata <- previous_dataset$columnMetaSig %||% list()
    current_metadata <- current_dataset$columnMetaSig %||% list()
    changed <- current_columns[vapply(
        current_columns,
        function(column_name) {
            !identical(
                as.character(previous_metadata[[column_name]] %||% ""),
                as.character(current_metadata[[column_name]] %||% "")
            )
        },
        logical(1)
    )]

    unique(as.character(changed %||% character(0)))
}


dataset_added_change <- function(dataset) {
    list(list(
        name = as.character(dataset$name %||% ""),
        kind = "dataset_added"
    ))
}


dataset_removed_change <- function(dataset) {
    list(list(
        name = as.character(dataset$name %||% ""),
        kind = "dataset_removed"
    ))
}


dataset_change <- function(previous_dataset, current_dataset) {
    if (is.null(previous_dataset) && is.null(current_dataset)) {
        return(NULL)
    }

    if (is.null(previous_dataset)) {
        return(dataset_added_change(current_dataset))
    }

    if (is.null(current_dataset)) {
        return(dataset_removed_change(previous_dataset))
    }

    name <- as.character(current_dataset$name %||% previous_dataset$name %||% "")
    changes <- list()
    columns_changed <- !identical(
        as.character(previous_dataset$columnsSig %||% ""),
        as.character(current_dataset$columnsSig %||% "")
    ) || !identical(
        as.integer(previous_dataset$columnCount %||% 0L),
        as.integer(current_dataset$columnCount %||% 0L)
    )

    if (columns_changed) {
        rename_change <- dataset_column_rename_change(
            name,
            previous_dataset$columns,
            current_dataset$columns,
            current_dataset$columnCount
        )
        removed_change <- dataset_column_removed_change(
            name,
            previous_dataset$columns,
            current_dataset$columns,
            current_dataset$columnCount
        )

        if (!is.null(rename_change)) {
            changes[[length(changes) + 1L]] <- rename_change
        }
        else if (!is.null(removed_change)) {
            changes[[length(changes) + 1L]] <- removed_change
        }
        else {
            changes[[length(changes) + 1L]] <- list(
                name = name,
                kind = "dataset_columns_changed",
                columns = dataset_changed_columns(
                    previous_dataset$columns,
                    current_dataset$columns
                ),
                columnCount = as.integer(current_dataset$columnCount %||% 0L),
                schemaChanged = TRUE
            )
        }
    }

    if (!identical(
        as.integer(previous_dataset$rowCount %||% 0L),
        as.integer(current_dataset$rowCount %||% 0L)
    )) {
        changes[[length(changes) + 1L]] <- list(
            name = name,
            kind = "dataset_rows_changed",
            rowCount = as.integer(current_dataset$rowCount %||% 0L)
        )
    }

    metadata_columns <- dataset_changed_variable_meta(
        previous_dataset,
        current_dataset
    )

    if (length(metadata_columns)) {
        changes[[length(changes) + 1L]] <- list(
            name = name,
            kind = "dataset_variable_meta_changed",
            columns = as.character(metadata_columns),
            schemaChanged = FALSE
        )
    }

    value_columns <- setdiff(
        dataset_changed_value_columns(previous_dataset, current_dataset),
        metadata_columns
    )

    if (length(value_columns)) {
        changes[[length(changes) + 1L]] <- list(
            name = name,
            kind = "dataset_cells_changed",
            columns = as.character(value_columns),
            rowCount = as.integer(current_dataset$rowCount %||% 0L),
            schemaChanged = FALSE
        )
    }

    if (!length(changes)) {
        return(NULL)
    }

    changes
}


workspace_state_from_snapshot <- function(snapshot) {
    snapshot <- snapshot %||% list()
    snapshot_variables <- snapshot$variables %||% list()
    signatures <- list()
    variables <- list()

    for (entry in snapshot_variables) {
        key <- as.character(entry$access_key %||% "")

        if (!nzchar(key)) {
            next
        }

        variables[[key]] <- entry
        signatures[[key]] <- workspace_change_signature_from_variable(entry)
    }

    list(
        signatures = signatures,
        variables = variables,
        datasetStates = snapshot$datasetStates %||% list(),
        select = snapshot$select %||% list(
            list = character(0),
            matrix = character(0),
            vector = character(0)
        ),
        searchPath = snapshot$searchPath %||% character(0),
        objectCount = as.integer(snapshot$objectCount %||% length(variables)),
        updatedAt = runtime_time_ms()
    )
}


workspace_dataset_change_entries <- function(
    name,
    value,
    previous_dataset_states
) {
    previous_state <- previous_dataset_states[[name]]
    current_state <- dataset_state_current(name, value, previous_state)

    list(
        state = current_state,
        changes = dataset_change(previous_state, current_state)
    )
}


workspace_variable_change_signature <- function(name, value, dataset_state = NULL) {
    if (is.data.frame(value) && !is.null(dataset_state)) {
        return(workspace_change_signature_current(
            name,
            value,
            dataset_state$objectHash %||% ""
        ))
    }

    workspace_change_signature_current(name, value)
}


collect_workspace_update <- function(previous_state = NULL) {
    previous_state <- previous_state %||% list(
        signatures = list(),
        variables = list(),
        objectCount = 0L
    )
    previous_signatures <- previous_state$signatures %||% list()
    previous_variables <- previous_state$variables %||% list()
    previous_dataset_states <- previous_state$datasetStates %||% list()
    object_names <- runtime_global_names()
    signatures <- list()
    variables <- previous_variables
    dataset_states <- list()
    added <- list()
    updated <- list()
    removed <- character(0)
    added_datasets <- character(0)
    removed_datasets <- character(0)
    changed_datasets <- list()
    vectors <- character(0)
    matrices <- character(0)
    lists <- character(0)
    updated_at <- runtime_time_ms()

    for (name in object_names) {
        value <- runtime_global_object(name)

        if (is.null(value)) {
            next
        }

        if (is.data.frame(value)) {
            dataset_update <- workspace_dataset_change_entries(
                name,
                value,
                previous_dataset_states
            )
            dataset_states[[name]] <- dataset_update$state

            for (change in dataset_update$changes %||% list()) {
                if (identical(change$kind %||% "", "dataset_added")) {
                    added_datasets <- c(added_datasets, name)
                }
                else {
                    changed_datasets[[length(changed_datasets) + 1L]] <- change
                }
            }
        }
        else if (is.matrix(value)) {
            matrices <- c(matrices, name)
        }
        else if (is.list(value)) {
            lists <- c(lists, name)
        }
        else if (is.atomic(value)) {
            vectors <- c(vectors, name)
        }

        signature <- workspace_variable_change_signature(
            name,
            value,
            dataset_states[[name]]
        )
        signatures[[name]] <- signature
        previous_signature <- previous_signatures[[name]]

        if (is.null(previous_signature)) {
            entry <- workspace_variable(name, value, updated_at, signature)
            variables[[name]] <- entry
            added[[length(added) + 1L]] <- entry
            next
        }

        if (!identical(previous_signature, signature)) {
            entry <- workspace_variable(name, value, updated_at, signature)
            variables[[name]] <- entry
            updated[[length(updated) + 1L]] <- entry
        }
    }

    for (name in names(previous_signatures)) {
        if (!nzchar(as.character(name %||% ""))) {
            next
        }

        if (!is.element(name, object_names)) {
            removed <- c(removed, name)
            variables[[name]] <- NULL
        }
    }

    for (name in names(previous_dataset_states)) {
        if (!nzchar(as.character(name %||% ""))) {
            next
        }

        if (!is.element(name, object_names)) {
            removed_datasets <- c(removed_datasets, name)
        }
    }

    list(
        update = list(
            added = added,
            updated = updated,
            removed = as.character(removed),
            datasets = list(
                added = as.character(added_datasets),
                removed = as.character(removed_datasets),
                changed = changed_datasets
            ),
            objectCount = as.integer(length(object_names)),
            updatedAt = updated_at
        ),
        state = list(
            signatures = signatures,
            variables = variables,
            datasetStates = dataset_states,
            select = list(
                list = as.character(lists),
                matrix = as.character(matrices),
                vector = as.character(vectors)
            ),
            searchPath = search(),
            objectCount = as.integer(length(object_names)),
            updatedAt = updated_at
        )
    )
}


workspace_dataset_summary <- function(value, dataset_state = NULL) {
    columns <- if (is.null(dataset_state)) {
        dataset_column_names(value)
    }
    else {
        as.character(dataset_state$columns %||% character(0))
    }
    summary <- list(colnames = columns)

    if (!length(columns)) {
        return(summary)
    }

    flag_names <- c(
        "numeric",
        "factor",
        "calibrated",
        "binary",
        "character",
        "categorical",
        "date"
    )
    flag_values <- lapply(flag_names, function(name) {
        logical(length(columns))
    })
    names(flag_values) <- flag_names

    cached_flags <- dataset_state$columnFlags %||% list()

    for (index in seq_along(columns)) {
        column_name <- columns[[index]]
        flags <- cached_flags[[column_name]]

        if (is.null(flags)) {
            flags <- dataset_column_flags(value[[column_name]])
        }

        for (flag_name in flag_names) {
            flag_values[[flag_name]][[index]] <- isTRUE(flags[[flag_name]])
        }
    }

    for (flag_name in flag_names) {
        summary[[flag_name]] <- as.logical(
            flag_values[[flag_name]] %||% logical(0)
        )
    }

    summary
}


workspace_snapshot <- function() {
    started_at <- runtime_time_ms()
    object_names <- runtime_global_names()
    data_frames <- list()
    dataset_states <- list()
    vectors <- character(0)
    matrices <- character(0)
    lists <- character(0)
    variables <- list()
    updated_at <- runtime_time_ms()
    previous_state <- if (exists("workspace_index_get", mode = "function")) {
        workspace_index_get("last_state") %||% list()
    }
    else {
        list()
    }
    previous_dataset_states <- previous_state$datasetStates %||% list()

    for (name in object_names) {
        value <- runtime_global_object(name)

        if (is.null(value)) {
            next
        }

        if (is.data.frame(value)) {
            dataset_states[[name]] <- dataset_state_current(
                name,
                value,
                previous_dataset_states[[name]]
            )
            data_frames[[name]] <- workspace_dataset_summary(
                value,
                dataset_states[[name]]
            )
        }
        else if (is.matrix(value)) {
            matrices <- c(matrices, name)
        }
        else if (is.list(value)) {
            lists <- c(lists, name)
        }
        else if (is.atomic(value)) {
            vectors <- c(vectors, name)
        }

        signature <- workspace_variable_change_signature(
            name,
            value,
            dataset_states[[name]]
        )
        previous_signature <- (previous_state$signatures %||% list())[[name]]
        previous_variable <- (previous_state$variables %||% list())[[name]]

        variables[[length(variables) + 1L]] <- if (
            !is.null(previous_variable) &&
            identical(previous_signature, signature)
        ) {
            previous_variable
        }
        else {
            workspace_variable(name, value, updated_at, signature)
        }
    }

    completed_at <- runtime_time_ms()

    list(
        searchPath = search(),
        dataframe = data_frames,
        select = list(
            list = as.character(lists),
            matrix = as.character(matrices),
            vector = as.character(vectors)
        ),
        variables = variables,
        datasetStates = dataset_states,
        objectCount = as.integer(length(object_names)),
        diagnostics = list(
            snapshotStartedMs = started_at,
            snapshotCompletedMs = completed_at,
            snapshotDurationMs = as.numeric(completed_at - started_at)
        )
    )
}


workspace_inspect <- function(name) {
    name <- as.character(name %||% "")

    if (!nzchar(name)) {
        return(list(ok = FALSE, error = "missing-workspace-name"))
    }

    if (!exists(name, envir = .GlobalEnv, inherits = FALSE)) {
        return(list(ok = FALSE, error = "workspace-object-not-found"))
    }

    value <- tryCatch(
        get(name, envir = .GlobalEnv, inherits = FALSE),
        error = function(error) error
    )

    if (inherits(value, "error")) {
        return(list(
            ok = FALSE,
            error = as.character(conditionMessage(value))
        ))
    }

    classes <- tryCatch(
        as.character(class(value)),
        error = function(error) character(0)
    )
    dimensions <- tryCatch(dim(value), error = function(error) NULL)
    value_names <- tryCatch(names(value), error = function(error) NULL)
    preview <- tryCatch(
        workspace_display_value(value),
        error = function(error) ""
    )

    list(
        ok = TRUE,
        result = list(
            name = name,
            class = as.character(classes %||% character(0)),
            type = as.character(typeof(value)),
            kind = workspace_kind(value),
            length = suppressWarnings(as.integer(length(value %||% list()))),
            size = as.numeric(utils::object.size(value)),
            dim = if (is.null(dimensions)) {
                integer(0)
            }
            else {
                suppressWarnings(as.integer(dimensions))
            },
            names = if (is.null(value_names)) {
                character(0)
            }
            else {
                utils::head(as.character(value_names), 200L)
            },
            hasViewer = isTRUE(
                is.data.frame(value) ||
                is.matrix(value) ||
                (is.array(value) && length(dim(value)) == 2L)
            ),
            preview = as.character(preview %||% "")
        )
    )
}

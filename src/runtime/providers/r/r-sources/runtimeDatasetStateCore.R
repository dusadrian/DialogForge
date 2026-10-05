runtime_time_ms <- function() {
    floor(unclass(Sys.time())[[1]] * 1000)
}


runtime_global_names <- function() {
    ls(envir = .GlobalEnv, all.names = FALSE)
}


runtime_global_object <- function(name) {
    get(name, envir = .GlobalEnv, inherits = FALSE)
}


workspace_active_binding_entry <- function(
    name,
    updated_at,
    binding = runtime_binding_info(.GlobalEnv, name)
) {
    if (is.element(binding$state, c("value", "forced"))) {
        return(NULL)
    }

    active <- identical(binding$state, "active")
    type <- if (active) "active binding" else paste(binding$state, "binding")
    runtime_diagnostic_count(if (active) "active_bindings_skipped" else "unevaluated_bindings_skipped")
    list(
        access_key = name,
        display_name = name,
        display_value = paste0("<", type, "; value not evaluated>"),
        display_type = type,
        type_info = type,
        kind = "binding",
        length = 0L,
        size = 0,
        has_children = FALSE,
        has_viewer = FALSE,
        is_truncated = FALSE,
        signature = paste0(binding$state, "-binding:not-evaluated"),
        updated_time = updated_at
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

    # These are internal character names, not values for S3 dispatch.
    changed <- c(
        previous_columns[!is.element(previous_columns, current_columns)],
        current_columns[!is.element(current_columns, previous_columns)]
    )

    if (!length(changed)) {
        changed <- current_columns
    }

    base::unique.default(as.character(changed %||% character(0)))
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
    runtime_diagnostic_count("column_hashes")
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

    runtime_diagnostic_count("dataset_hashes")
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

    base::unique.default(as.character(changed %||% character(0)))
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

    base::unique.default(as.character(changed %||% character(0)))
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

    value_columns <- dataset_changed_value_columns(previous_dataset, current_dataset)
    # One replacement can change both values and metadata. A metadata receipt
    # cannot suppress the value receipt: Data and Variables have separate caches.
    # Column hashes include attributes, so metadata-only edits conservatively
    # refresh their bounded Data viewport too.

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


workspace_copy_select_state <- function(select, source_name, target_name) {
    select <- select %||% list(
        list = character(0),
        matrix = character(0),
        vector = character(0)
    )

    for (kind in c("list", "matrix", "vector")) {
        values <- as.character(select[[kind]] %||% character(0))

        if (is.element(source_name, values)) {
            select[[kind]] <- base::unique.default(c(values, target_name))
        }
    }

    select
}


workspace_inspection_method_names <- function(class_name, generics) {
    if (identical(class_name, "default")) {
        # These preview fallbacks may be reached through generated values,
        # even when the original object has a supported explicit class.
        # Package lookup used by metadata inference also dispatches unique().
        # Its default override is unsafe even though our own name bookkeeping
        # calls base::unique.default directly.
        methods <- c("head.default", "format.default", "str.default", "unique.default")
        if (runtime_inspection_names_contain("undeclare", generics)) {
            methods <- c(methods, "undeclare.default")
        }
        return(methods)
    }

    paste0(generics, ".", class_name)
}


workspace_registered_inspection_classes <- function(
    classes,
    generics,
    namespaces = list(asNamespace("base"), asNamespace("utils"))
) {
    overridden <- character(0)

    for (namespace in namespaces) {
        methods <- get(".__S3MethodsTable__.", envir = namespace, inherits = FALSE)
        bindings <- ls(envir = methods, all.names = TRUE)

        # These are our plain character vectors. Set operations call generic
        # unique(), so use membership filtering before trusting any methods.
        for (class_name in classes[!runtime_inspection_names_contain(classes, overridden)]) {
            candidates <- workspace_inspection_method_names(class_name, generics)
            method_names <- candidates[runtime_inspection_names_contain(candidates, bindings)]

            for (method_name in method_names) {
                stock <- FALSE
                for (owner in namespaces) {
                    if (runtime_registered_method_is_stock(
                        methods, method_name, owner
                    )) {
                        stock <- TRUE
                        break
                    }
                }

                if (!stock) {
                    overridden <- c(overridden, class_name)
                    break
                }
            }
        }
    }

    overridden
}


workspace_overridden_inspection_classes <- function() {
    classes <- c(
        "data.frame", "factor", "ordered", "Date", "POSIXct", "POSIXlt",
        "POSIXt", "difftime", "declared",
        "NULL", "logical", "integer", "double", "numeric", "complex",
        "character", "raw", "list", "matrix", "array", "default"
    )
    namespaces <- list(asNamespace("base"), asNamespace("utils"))
    # This is a method inventory, not a package-loading action. Package lookup
    # itself calls generic unique() and can invoke a workspace override.
    # Metadata operations retain their existing declared namespace loader.
    declared_namespace <- runtime_inspection_declared_namespace()
    if (is.environment(declared_namespace)) {
        namespaces <- c(namespaces, list(declared_namespace))
    }
    # Include the secondary dispatch used by standard formatting and column flags.
    generics <- c(
        "dim", "dimnames", "length", "names", "[", "[[", "$",
        "head", "str", "format", "print", "as.character", "as.vector",
        "as.list", "as.double", "as.integer", "as.logical", "as.Date",
        "as.POSIXct", "as.POSIXlt", "is.na", "is.numeric", "is.finite",
        "anyNA", "unique", "levels", "droplevels", "Summary", "Math",
        "Ops", "summary", "c", "rep", "units",
        # Individual methods take precedence over their group method. Checking
        # Ops/Math/Summary alone does not detect these replacements.
        "+", "-", "*", "/", "^", "%%", "%/%", "&", "|", "!",
        "==", "!=", "<", "<=", ">=", ">",
        "all", "any", "sum", "prod", "min", "max", "range",
        "abs", "sign", "sqrt", "floor", "ceiling", "trunc", "round", "signif",
        "exp", "expm1", "log", "log10", "log2", "log1p",
        "cos", "sin", "tan", "cospi", "sinpi", "tanpi",
        "acos", "asin", "atan", "cosh", "sinh", "tanh",
        "acosh", "asinh", "atanh", "lgamma", "gamma", "digamma", "trigamma",
        "cumsum", "cumprod", "cummax", "cummin"
    )
    # Include search-path overrides even before the namespace is loaded;
    # measurement inference can subsequently need declared::undeclare().
    generics <- c(generics, "undeclare")
    overridden <- workspace_registered_inspection_classes(
        classes,
        generics,
        namespaces
    )
    # Production helpers live in an attached environment below .GlobalEnv.
    # Start at the global environment so its method bindings are not skipped.
    scope <- .GlobalEnv
    while (!identical(scope, emptyenv())) {
        # Only namespaces are trusted wholesale. Attached package environments
        # do not need to export these method bindings and can be name-spoofed.
        trusted <- identical(scope, baseenv()) ||
            identical(scope, asNamespace("base")) ||
            identical(scope, asNamespace("utils"))

        if (!trusted) {
            bindings <- ls(envir = scope, all.names = TRUE)

            for (class_name in classes[!runtime_inspection_names_contain(classes, overridden)]) {
                candidates <- workspace_inspection_method_names(class_name, generics)
                method_names <- candidates[runtime_inspection_names_contain(candidates, bindings)]
                for (method_name in method_names) {
                    # An attached export can be the stock method (head.matrix
                    # is exported by utils). Verify the binding's provenance;
                    # never trust an attached environment by its display name.
                    stock <- FALSE
                    for (namespace in namespaces) {
                        if (runtime_registered_method_is_stock(
                            scope, method_name, namespace
                        )) {
                            stock <- TRUE
                            break
                        }
                    }
                    if (!stock) {
                        overridden <- c(overridden, class_name)
                        break
                    }
                }
            }
        }

        scope <- parent.env(scope)
    }

    # Date and POSIXct formatting constructs POSIXlt intermediates. An override
    # on that intermediate (or its POSIXt parent) also restricts the source.
    if (any(runtime_inspection_names_contain(c("POSIXlt", "POSIXt"), overridden))) {
        dependencies <- c("Date", "POSIXct", "POSIXt")
        overridden <- c(overridden, dependencies[!runtime_inspection_names_contain(dependencies, overridden)])
    }

    overridden
}


workspace_stored_value_is_inspectable <- function(
    value,
    standard_classes = FALSE,
    overridden_classes = workspace_overridden_inspection_classes()
) {
    # A replaced preview fallback can be reached by intermediate values as well
    # as the stored object. Keep entries opaque until the stock method returns.
    if (runtime_inspection_names_contain("default", overridden_classes)) {
        return(FALSE)
    }

    # Run before R-level attributes, traversal, lengths, previews or hashing.
    if (!runtime_stored_graph_is_inspectable(value)) {
        return(FALSE)
    }
    pending <- list(value)
    inspected <- 0L
    supported_classes <- list("data.frame")

    if (isTRUE(standard_classes)) {
        supported_classes <- c(supported_classes, list(
            "factor", c("ordered", "factor"), "Date",
            c("POSIXct", "POSIXt"), "difftime"
        ))

        # Stored classes survive workspace restore without loading namespaces.
        # Eligibility must not depend on whether a dialog has already requested
        # declared. Existing metadata readers own namespace loading; this scan
        # still rejects registered/search-path overrides and unsafe value graphs.
        declared_classes <- c(
            list("logical", "integer", "numeric", "complex", "character", "raw"),
            supported_classes[-1L]
        )
        for (classes in declared_classes) {
            supported_classes <- c(supported_classes, list(c("declared", classes)))
        }
    }

    while (length(pending)) {
        index <- length(pending)
        current <- .subset2(pending, index)
        pending[index] <- NULL
        inspected <- inspected + 1L

        if (inspected > 4096L) {
            return(FALSE)
        }

        # S3 generics such as head also dispatch on implicit classes. class()
        # is a primitive stored-class query; the compiled preflight has already
        # rejected callback-backed attributes. Include the underlying numeric
        # classes because matrix/array class() omits that dispatch fallback.
        inspection_classes <- c(class(current), typeof(current))
        if (runtime_inspection_names_contain(typeof(current), c("integer", "double"))) {
            inspection_classes <- c(inspection_classes, "numeric")
        }

        # Only inspect stored values, never class methods or reference contents.
        if (
            isS4(current) ||
            any(runtime_inspection_names_contain(inspection_classes, overridden_classes)) ||
            !runtime_inspection_names_contain(typeof(current), c(
                "NULL", "logical", "integer", "double", "complex",
                "character", "raw", "list"
            )) ||
            (is.object(current) && !any(vapply(
                supported_classes, identical, logical(1),
                attr(current, "class", exact = TRUE)
            )))
        ) {
            return(FALSE)
        }

        stored_attributes <- attributes(current)
        stored_values <- if (typeof(current) == "list") {
            unclass(current)
        }
        else {
            list()
        }

        if (
            inspected + length(pending) + length(stored_attributes) +
                length(stored_values) > 4096L
        ) {
            return(FALSE)
        }

        for (attribute in stored_attributes) {
            pending[length(pending) + 1L] <- list(attribute)
        }

        for (index in seq_along(stored_values)) {
            pending[length(pending) + 1L] <- list(.subset2(stored_values, index))
        }
    }

    TRUE
}


workspace_copy_value_is_reusable <- function(value) {
    workspace_stored_value_is_inspectable(value)
}


workspace_restricted_variable <- function(
    name,
    value,
    updated_at,
    overridden_classes = workspace_overridden_inspection_classes()
) {
    if (workspace_stored_value_is_inspectable(
        value, standard_classes = TRUE, overridden_classes = overridden_classes
    )) {
        return(NULL)
    }

    classes <- attr(value, "class", exact = TRUE)
    type <- typeof(value)

    if (
        runtime_stored_graph_is_inspectable(classes) &&
        typeof(classes) == "character" && is.null(attributes(classes))
    ) {
        type <- paste(classes, collapse = "/")
    }

    runtime_diagnostic_count("restricted_objects_skipped")
    list(
        access_key = name,
        display_name = name,
        display_value = "",
        display_type = type,
        type_info = type,
        kind = if (is.function(value)) "function" else "other",
        length = 0L,
        size = 0,
        has_children = FALSE,
        has_viewer = FALSE,
        is_truncated = FALSE,
        signature = paste0("restricted:", type),
        updated_time = updated_at
    )
}


workspace_copy_cached_state <- function(
    previous_state,
    source_name,
    target_name
) {
    previous_state <- previous_state %||% list()
    source_name <- as.character(source_name %||% "")
    target_name <- as.character(target_name %||% "")
    signatures <- previous_state$signatures %||% list()
    variables <- previous_state$variables %||% list()
    dataset_states <- previous_state$datasetStates %||% list()

    if (
        !nzchar(source_name) ||
        !nzchar(target_name) ||
        identical(source_name, target_name) ||
        is.null(signatures[[source_name]]) ||
        is.null(variables[[source_name]]) ||
        !is.null(signatures[[target_name]]) ||
        !exists(source_name, envir = .GlobalEnv, inherits = FALSE) ||
        !exists(target_name, envir = .GlobalEnv, inherits = FALSE)
    ) {
        return(NULL)
    }

    source_binding <- runtime_binding_info(.GlobalEnv, source_name)
    target_binding <- runtime_binding_info(.GlobalEnv, target_name)
    if (
        !is.element(source_binding$state, c("value", "forced")) ||
        !is.element(target_binding$state, c("value", "forced")) ||
        !workspace_copy_value_is_reusable(source_binding$value) ||
        !workspace_copy_value_is_reusable(target_binding$value) ||
        !identical(source_binding$value, target_binding$value)
    ) {
        return(NULL)
    }

    updated_at <- runtime_time_ms()
    entry <- variables[[source_name]]
    source_value <- source_binding$value

    entry$access_key <- target_name
    entry$display_name <- target_name
    entry$updated_time <- updated_at
    variables[[target_name]] <- entry
    signatures[[target_name]] <- signatures[[source_name]]
    copied_datasets <- list()
    source_dataset <- dataset_states[[source_name]]

    if (!is.null(source_dataset)) {
        source_dataset$name <- target_name
        dataset_states[[target_name]] <- source_dataset
        copied_datasets[[1L]] <- list(
            source = source_name,
            target = target_name
        )
    }

    list(
        update = list(
            added = list(entry),
            updated = list(),
            removed = character(0),
            datasets = list(
                added = if (is.null(source_dataset)) {
                    character(0)
                }
                else {
                    target_name
                },
                removed = character(0),
                changed = list(),
                copied = copied_datasets
            ),
            objectCount = as.integer(length(runtime_global_names())),
            updatedAt = updated_at
        ),
        state = list(
            signatures = signatures,
            variables = variables,
            datasetStates = dataset_states,
            select = workspace_copy_select_state(
                previous_state$select,
                source_name,
                target_name
            ),
            searchPath = previous_state$searchPath %||% search(),
            objectCount = as.integer(length(runtime_global_names())),
            updatedAt = updated_at
        )
    )
}


workspace_remove_cached_state <- function(previous_state, removed_names) {
    previous_state <- previous_state %||% list()
    removed_names <- base::unique.default(as.character(removed_names %||% character(0)))
    removed_names <- removed_names[nzchar(removed_names)]
    signatures <- previous_state$signatures %||% list()
    variables <- previous_state$variables %||% list()
    dataset_states <- previous_state$datasetStates %||% list()
    known_names <- base::unique.default(c(names(signatures), names(variables)))
    still_exists <- vapply(
        removed_names,
        exists,
        logical(1),
        envir = .GlobalEnv,
        inherits = FALSE
    )

    if (
        !length(removed_names) ||
        !all(vapply(removed_names, is.element, logical(1), known_names)) ||
        any(still_exists)
    ) {
        return(NULL)
    }

    removed_datasets <- removed_names[is.element(removed_names, names(dataset_states))]

    for (name in removed_names) {
        signatures[[name]] <- NULL
        variables[[name]] <- NULL
        dataset_states[[name]] <- NULL
    }

    select <- previous_state$select %||% list()

    for (kind in c("list", "matrix", "vector")) {
        values <- as.character(select[[kind]] %||% character(0))
        select[[kind]] <- base::unique.default(values[!is.element(values, removed_names)])
    }

    updated_at <- runtime_time_ms()
    object_count <- as.integer(length(runtime_global_names()))

    list(
        update = list(
            added = list(),
            updated = list(),
            removed = removed_names,
            datasets = list(
                added = character(0),
                removed = removed_datasets,
                changed = list(),
                copied = list()
            ),
            objectCount = object_count,
            updatedAt = updated_at
        ),
        state = list(
            signatures = signatures,
            variables = variables,
            datasetStates = dataset_states,
            select = select,
            searchPath = previous_state$searchPath %||% search(),
            objectCount = object_count,
            updatedAt = updated_at
        )
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
    runtime_diagnostic_count("workspace_scans")
    runtime_diagnostic_mark("reconciliation.started")
    on.exit(runtime_diagnostic_mark("reconciliation.finished"), add = TRUE)
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
    overridden_classes <- workspace_overridden_inspection_classes()

    for (name in object_names) {
        binding <- runtime_binding_info(.GlobalEnv, name)
        binding_entry <- workspace_active_binding_entry(name, updated_at, binding)

        if (!is.null(binding_entry)) {
            signatures[[name]] <- binding_entry$signature
            variables[[name]] <- binding_entry

            if (is.null(previous_signatures[[name]])) {
                added[[length(added) + 1L]] <- binding_entry
            }
            else if (!identical(previous_signatures[[name]], binding_entry$signature)) {
                updated[[length(updated) + 1L]] <- binding_entry
            }
            next
        }

        value <- binding$value

        restricted_entry <- workspace_restricted_variable(
            name, value, updated_at, overridden_classes
        )

        if (!is.null(restricted_entry)) {
            signatures[[name]] <- restricted_entry$signature
            variables[[name]] <- restricted_entry

            if (is.null(previous_signatures[[name]])) {
                added[[length(added) + 1L]] <- restricted_entry
            }
            else {
                # Opaque contents cannot establish equality with the old value.
                updated[[length(updated) + 1L]] <- restricted_entry
            }
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
            entry <- workspace_variable(
                name,
                value,
                updated_at,
                signature,
                dataset_states[[name]]
            )
            variables[[name]] <- entry
            added[[length(added) + 1L]] <- entry
            next
        }

        if (!identical(previous_signature, signature)) {
            entry <- workspace_variable(
                name,
                value,
                updated_at,
                signature,
                dataset_states[[name]]
            )
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

        if (!is.element(name, names(dataset_states))) {
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
    row_count <- if (is.null(dataset_state)) {
        tryCatch(nrow(value), error = function(error) 0L)
    }
    else {
        dataset_state$rowCount %||% 0L
    }
    summary <- list(
        colnames = columns,
        rowCount = as.integer(row_count %||% 0L),
        columnCount = as.integer(length(columns))
    )

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
    runtime_diagnostic_count("workspace_scans")
    runtime_diagnostic_mark("reconciliation.started")
    on.exit(runtime_diagnostic_mark("reconciliation.finished"), add = TRUE)
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
    overridden_classes <- workspace_overridden_inspection_classes()

    for (name in object_names) {
        binding <- runtime_binding_info(.GlobalEnv, name)
        binding_entry <- workspace_active_binding_entry(name, updated_at, binding)

        if (!is.null(binding_entry)) {
            variables[[length(variables) + 1L]] <- binding_entry
            next
        }

        value <- binding$value

        restricted_entry <- workspace_restricted_variable(
            name, value, updated_at, overridden_classes
        )

        if (!is.null(restricted_entry)) {
            variables[[length(variables) + 1L]] <- restricted_entry
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
            workspace_variable(
                name,
                value,
                updated_at,
                signature,
                dataset_states[[name]]
            )
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
            size = workspace_object_size_bytes(value),
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

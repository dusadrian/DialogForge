workspace_dimensions <- function(value) {
    tryCatch(dim(value), error = function(error) NULL)
}


workspace_is_tabular <- function(value) {
    dimensions <- workspace_dimensions(value)

    is.data.frame(value) ||
        is.matrix(value) ||
        (is.array(value) && length(dimensions) == 2L)
}


workspace_kind <- function(value) {
    if (workspace_is_tabular(value)) return("table")
    if (is.function(value)) return("function")
    if (isS4(value) || is.environment(value)) return("class")
    if (is.logical(value) && length(value) <= 1L) return("boolean")
    if (is.numeric(value) || is.integer(value) || is.complex(value)) {
        return("number")
    }
    if (is.character(value) && length(value) <= 1L) return("string")
    if (is.list(value) || is.atomic(value) || is.array(value)) {
        return("collection")
    }

    "other"
}


workspace_type <- function(value) {
    classes <- tryCatch(
        as.character(class(value) %||% character(0)),
        error = function(error) character(0)
    )

    if (length(classes)) {
        return(paste(classes, collapse = "/"))
    }

    as.character(typeof(value))
}


workspace_truncate_text <- function(text, limit) {
    text <- as.character(text %||% "")
    truncated <- nchar(text, type = "chars") > limit

    if (isTRUE(truncated)) {
        text <- substr(text, 1L, limit)
    }

    list(
        text = paste0(text, if (isTRUE(truncated)) "..." else ""),
        truncated = isTRUE(truncated)
    )
}


workspace_preview_scalar <- function(value) {
    text <- tryCatch(
        as.character(value[[1]]),
        error = function(error) ""
    )

    workspace_truncate_text(text, 24L)$text
}


workspace_preview_atomic <- function(value) {
    head_values <- tryCatch(
        utils::head(value, 4L),
        error = function(error) value
    )
    values <- tryCatch(
        as.character(head_values),
        error = function(error) character(0)
    )

    if (!length(values)) {
        return("")
    }

    text <- paste(values, collapse = ", ")
    if (length(value) > 4L) paste0(text, ", ...") else text
}


workspace_preview_structure <- function(value) {
    text <- tryCatch(
        paste(
            utils::capture.output(
                utils::str(value, max.level = 1L, give.attr = FALSE)
            ),
            collapse = " "
        ),
        error = function(error) ""
    )
    text <- workspace_truncate_text(text, 24L)$text

    if (nzchar(text)) text else "?"
}


workspace_preview_component <- function(value) {
    if (is.null(value)) return("NULL")
    if (is.atomic(value) && length(value) <= 1L) {
        return(workspace_preview_scalar(value))
    }
    if (is.atomic(value)) {
        return(paste0(workspace_preview_scalar(value), ", ..."))
    }
    if (is.list(value) && !length(value)) return("[]")
    if (is.list(value)) {
        suffix <- if (length(value) > 1L) ", ..." else ""
        return(paste0(
            "[",
            workspace_preview_component(value[[1]]),
            suffix,
            "]"
        ))
    }

    workspace_preview_structure(value)
}


workspace_preview_list_item <- function(value, names, index) {
    label <- ""

    if (!is.null(names) && length(names) >= index) {
        item_name <- tryCatch(
            as.character(names[[index]]),
            error = function(error) ""
        )

        if (length(item_name) && !is.na(item_name) && nzchar(item_name)) {
            label <- paste0(item_name, ": ")
        }
    }

    text <- tryCatch(
        workspace_preview_component(value[[index]]),
        error = function(error) "?"
    )

    paste0(label, text)
}


workspace_preview_list <- function(value) {
    head_values <- tryCatch(
        utils::head(value, 4L),
        error = function(error) value
    )
    value_names <- tryCatch(names(value), error = function(error) NULL)
    parts <- vapply(seq_along(head_values), function(index) {
        workspace_preview_list_item(head_values, value_names, index)
    }, character(1))
    text <- paste(parts, collapse = ", ")

    if (length(value) > 4L) {
        text <- paste0(text, ", ...")
    }

    paste0("[", text, "]")
}


workspace_display_value <- function(value) {
    if (workspace_is_tabular(value)) {
        return(paste0(nrow(value), " x ", ncol(value)))
    }

    if (is.function(value)) return("function")

    if (is.character(value) && length(value) == 1L) {
        return(workspace_truncate_text(value[[1]], 60L)$text)
    }

    if (is.atomic(value)) return(workspace_preview_atomic(value))
    if (is.list(value)) return(workspace_preview_list(value))

    text <- tryCatch(
        paste(
            utils::capture.output(
                utils::str(value, max.level = 1L, give.attr = FALSE)
            ),
            collapse = " "
        ),
        error = function(error) ""
    )

    workspace_truncate_text(text, 60L)$text
}


workspace_hash_raw <- function(raw_value) {
    bytes <- tryCatch(
        as.integer(raw_value),
        error = function(error) integer(0)
    )
    length_bytes <- length(bytes)

    if (!length_bytes) return("0:0:0:0")

    index <- seq_len(length_bytes)
    paste(
        as.character(length_bytes),
        format(sum(bytes), scientific = FALSE, trim = TRUE),
        format(
            sum((index %% 104729) * bytes),
            scientific = FALSE,
            trim = TRUE
        ),
        format(
            sum(((index * 131) %% 524287) * bytes),
            scientific = FALSE,
            trim = TRUE
        ),
        sep = ":"
    )
}


workspace_digest_func <- tryCatch({
    if (isTRUE(requireNamespace("digest", quietly = TRUE))) {
        get("digest", envir = asNamespace("digest"), inherits = FALSE)
    }
    else {
        NULL
    }
}, error = function(error) NULL)


workspace_value_hash <- function(value) {
    if (is.function(workspace_digest_func)) {
        hash <- tryCatch(
            workspace_digest_func(
                value,
                algo = "xxhash64",
                serialize = TRUE
            ),
            error = function(error) ""
        )

        if (nzchar(hash)) return(hash)
    }

    raw_value <- tryCatch(
        serialize(value, NULL, ascii = FALSE, version = 2L),
        error = function(error) raw(0)
    )

    if (!length(raw_value)) "" else workspace_hash_raw(raw_value)
}


workspace_signature_parts <- function(value, value_hash) {
    dimensions <- workspace_dimensions(value)
    hash <- as.character(value_hash %||% "")

    if (!nzchar(hash)) {
        hash <- workspace_value_hash(value)
    }

    c(
        paste(
            as.character(class(value) %||% typeof(value)),
            collapse = "|"
        ),
        as.character(typeof(value)),
        as.character(suppressWarnings(as.integer(length(value %||% list())))),
        if (is.null(dimensions)) "" else paste(dimensions, collapse = "x"),
        as.character(
            is.list(value) ||
                is.environment(value) ||
                is.data.frame(value) ||
                is.matrix(value) ||
                (is.atomic(value) && length(value) > 1L)
        ),
        as.character(workspace_is_tabular(value)),
        hash
    )
}


workspace_list_child_signature <- function(value, names, index) {
    item <- tryCatch(value[[index]], error = function(error) NULL)
    item_name <- if (length(names) >= index) {
        as.character(names[[index]] %||% "")
    }
    else {
        ""
    }

    paste(
        item_name,
        paste(
            as.character(class(item) %||% typeof(item)),
            collapse = "|"
        ),
        as.character(
            suppressWarnings(as.integer(length(item %||% list())))
        ),
        sep = "|"
    )
}


workspace_signature_current <- function(value, value_hash = NULL) {
    parts <- workspace_signature_parts(value, value_hash)
    dimensions <- workspace_dimensions(value)

    if (is.data.frame(value)) {
        columns <- tryCatch(
            as.character(colnames(value) %||% character(0)),
            error = function(error) character(0)
        )
        return(paste(c("data.frame", parts, columns), collapse = "\r"))
    }

    if (
        is.matrix(value) ||
        (is.array(value) && length(dimensions) == 2L)
    ) {
        values <- tryCatch(
            as.character(utils::head(as.vector(value), 8L)),
            error = function(error) character(0)
        )
        return(paste(c("tabular", parts, values), collapse = "\r"))
    }

    if (is.atomic(value)) {
        values <- tryCatch(
            as.character(utils::head(value, 8L)),
            error = function(error) character(0)
        )
        return(paste(c("atomic", parts, values), collapse = "\r"))
    }

    if (is.list(value)) {
        value_names <- tryCatch(
            as.character(names(value) %||% character(0)),
            error = function(error) character(0)
        )
        limit <- min(length(value), 8L)
        child_signatures <- if (limit > 0L) {
            vapply(seq_len(limit), function(index) {
                workspace_list_child_signature(value, value_names, index)
            }, character(1))
        }
        else {
            character(0)
        }
        return(paste(
            c("list", parts, child_signatures),
            collapse = "\r"
        ))
    }

    if (is.environment(value) || isS4(value)) {
        members <- tryCatch(
            as.character(
                utils::head(names(value), 12L) %||% character(0)
            ),
            error = function(error) character(0)
        )
        return(paste(c("object", parts, members), collapse = "\r"))
    }

    paste(c("other", parts), collapse = "\r")
}


workspace_variable <- function(name, value, updated_ms, signature = NULL) {
    display <- workspace_truncate_text(
        workspace_display_value(value),
        60L
    )
    signature <- as.character(signature %||% "")

    if (!nzchar(signature)) {
        signature <- workspace_signature_current(value)
    }

    list(
        access_key = as.character(name),
        display_name = as.character(name),
        display_value = display$text,
        display_type = workspace_type(value),
        type_info = workspace_type(value),
        size = as.numeric(utils::object.size(value)),
        kind = workspace_kind(value),
        length = suppressWarnings(as.integer(length(value %||% list()))),
        has_children = isTRUE(
            is.list(value) ||
                is.environment(value) ||
                is.data.frame(value) ||
                is.matrix(value) ||
                (is.atomic(value) && length(value) > 1L)
        ),
        has_viewer = isTRUE(workspace_is_tabular(value)),
        is_truncated = display$truncated,
        signature = signature,
        updated_time = as.numeric(updated_ms %||% 0)
    )
}


workspace_change_signature_from_variable <- function(variable_entry) {
    signature <- as.character(variable_entry$signature %||% "")

    if (nzchar(signature)) return(signature)

    paste(
        as.character(variable_entry$access_key %||% ""),
        as.character(variable_entry$display_name %||% ""),
        as.character(variable_entry$display_value %||% ""),
        as.character(variable_entry$display_type %||% ""),
        as.character(variable_entry$type_info %||% ""),
        as.character(variable_entry$kind %||% ""),
        as.character(variable_entry$length %||% ""),
        as.character(variable_entry$has_children %||% ""),
        as.character(variable_entry$has_viewer %||% ""),
        sep = "\r"
    )
}


workspace_change_signature_current <- function(
    name,
    value,
    value_hash = NULL
) {
    workspace_signature_current(value, value_hash)
}


workspace_schema_attribute_integer <- function(column, name) {
    value <- tryCatch(
        attr(column, name, exact = TRUE),
        error = function(error) NULL
    )

    if (is.null(value) || !length(value)) return(NA_integer_)
    suppressWarnings(as.integer(value[[1]]))
}


workspace_schema_column_decimals <- function(column, width) {
    decimals <- workspace_schema_attribute_integer(column, "decimals")

    if (is.finite(decimals) && !is.na(decimals)) {
        return(max(0L, min(8L, decimals)))
    }

    base_decimals <- if (is.numeric(column)) {
        values <- tryCatch(
            utils::head(column[is.finite(column)], 100L),
            error = function(error) numeric(0)
        )

        if (
            length(values) &&
            any(
                abs(values - round(values)) > .Machine$double.eps^0.5,
                na.rm = TRUE
            )
        ) {
            3L
        }
        else {
            0L
        }
    }
    else {
        labels <- tryCatch(
            attr(column, "labels", exact = TRUE),
            error = function(error) NULL
        )

        if (!is.null(labels) && length(labels)) return(0L)
        0L
    }
    width <- suppressWarnings(as.integer(width %||% 1L))

    if (!is.finite(width) || is.na(width)) width <- 1L
    if (!is.finite(base_decimals) || is.na(base_decimals)) base_decimals <- 0L

    max(0L, min(8L, base_decimals, max(0L, width - 2L)))
}


workspace_object <- function(name) {
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

    list(ok = TRUE, name = name, value = value)
}


workspace_inspect <- function(name) {
    object <- workspace_object(name)

    if (!isTRUE(object$ok)) return(object)

    dimensions <- workspace_dimensions(object$value)
    value_names <- tryCatch(
        names(object$value),
        error = function(error) NULL
    )
    preview <- tryCatch(
        workspace_display_value(object$value),
        error = function(error) ""
    )

    list(
        ok = TRUE,
        result = list(
            name = object$name,
            class = tryCatch(
                as.character(class(object$value)),
                error = function(error) character(0)
            ),
            type = as.character(typeof(object$value)),
            kind = workspace_kind(object$value),
            length = suppressWarnings(
                as.integer(length(object$value %||% list()))
            ),
            size = as.numeric(utils::object.size(object$value)),
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
            hasViewer = isTRUE(workspace_is_tabular(object$value)),
            preview = as.character(preview %||% "")
        )
    )
}


workspace_schema_column_names <- function(value, column_count) {
    columns <- tryCatch(
        colnames(value),
        error = function(error) NULL
    )

    if (!is.null(columns) && length(columns)) {
        return(as.character(columns))
    }

    paste0("V", seq_len(max(1L, column_count)))
}


workspace_schema_column_types <- function(value, column_names) {
    tryCatch({
        if (is.data.frame(value)) {
            return(vapply(value, function(column) {
                paste(
                    as.character(class(column) %||% typeof(column)),
                    collapse = "/"
                )
            }, character(1)))
        }

        if (is.matrix(value)) {
            return(rep.int(
                paste(
                    as.character(class(value) %||% typeof(value)),
                    collapse = "/"
                ),
                length(column_names)
            ))
        }

        rep.int(as.character(typeof(value)), length(column_names))
    }, error = function(error) rep.int("unknown", length(column_names)))
}


workspace_schema_column_widths <- function(value, column_names) {
    if (!is.data.frame(value)) {
        return(rep.int(1L, length(column_names)))
    }

    tryCatch(vapply(value, function(column) {
        width <- workspace_schema_attribute_integer(column, "width")

        if (is.finite(width) && !is.na(width) && width > 0L) {
            return(max(1L, min(60L, width)))
        }

        1L
    }, integer(1)), error = function(error) {
        rep.int(1L, length(column_names))
    })
}


workspace_cached_dataset_state <- function(name, names) {
    if (!exists("workspace_index_get", mode = "function")) {
        return(NULL)
    }

    state <- workspace_index_get("last_state") %||% list()
    dataset <- (state$datasetStates %||% list())[[as.character(name %||% "")]]

    if (
        is.null(dataset) ||
        !identical(
            as.character(dataset$columns %||% character(0)),
            as.character(names %||% character(0))
        )
    ) {
        return(NULL)
    }

    dataset
}


workspace_schema_column_flags <- function(dataset, names, dataset_name = "") {
    cached_dataset <- workspace_cached_dataset_state(dataset_name, names)

    if (!is.null(cached_dataset)) {
        cached_flags <- cached_dataset$columnFlags %||% list()

        if (all(vapply(names, function(name) {
            is.element(name, base::names(cached_flags))
        }, logical(1)))) {
            return(unname(cached_flags[names]))
        }
    }

    if (
        !is.data.frame(dataset) ||
        !exists("workspace_dataset_item_flags", mode = "function")
    ) {
        return(rep(list(list()), length(names)))
    }

    lapply(names, function(name) {
        column <- tryCatch(
            dataset[[name]],
            error = function(error) NULL
        )

        tryCatch(
            workspace_dataset_item_flags(column),
            error = function(error) list()
        )
    })
}


workspace_schema_column_json <- function(names, types, decimals, flags) {
    vapply(seq_along(names), function(index) {
        column_flags <- flags[[index]] %||% list()

        paste0(
            "{",
            "\"name\":", json_str(
                as.character(names[[index]] %||% paste0("V", index))
            ), ",",
            "\"type\":", json_str(
                as.character(types[[index]] %||% "unknown")
            ), ",",
            "\"decimals\":", json_num(decimals[[index]] %||% 0L),
            ",\"numeric\":", json_bool(column_flags$numeric),
            ",\"character\":", json_bool(column_flags$character),
            ",\"logical\":", json_bool(
                identical(types[[index]], "logical")
            ),
            ",\"factor\":", json_bool(column_flags$factor),
            ",\"calibrated\":", json_bool(column_flags$calibrated),
            ",\"binary\":", json_bool(column_flags$binary),
            ",\"categorical\":", json_bool(column_flags$categorical),
            ",\"date\":", json_bool(column_flags$date),
            "}"
        )
    }, character(1))
}


workspace_dataset_schema <- function(name) {
    object <- workspace_object(name)

    if (!isTRUE(object$ok)) return(object)
    if (!workspace_is_tabular(object$value)) {
        return(list(ok = FALSE, error = "workspace-object-not-tabular"))
    }

    dimensions <- workspace_dimensions(object$value)
    row_count <- if (!is.null(dimensions) && length(dimensions) >= 1L) {
        suppressWarnings(as.integer(dimensions[[1]]))
    }
    else {
        suppressWarnings(as.integer(length(object$value)))
    }
    column_count <- if (is.data.frame(object$value)) {
        suppressWarnings(as.integer(ncol(object$value)))
    }
    else if (!is.null(dimensions) && length(dimensions) >= 2L) {
        suppressWarnings(as.integer(dimensions[[2]]))
    }
    else {
        1L
    }
    column_names <- workspace_schema_column_names(
        object$value,
        column_count
    )
    column_types <- workspace_schema_column_types(
        object$value,
        column_names
    )
    column_widths <- workspace_schema_column_widths(
        object$value,
        column_names
    )
    column_decimals <- if (is.data.frame(object$value)) {
        tryCatch(vapply(seq_along(object$value), function(index) {
            workspace_schema_column_decimals(
                object$value[[index]],
                column_widths[[index]]
            )
        }, integer(1)), error = function(error) {
            rep.int(0L, length(column_names))
        })
    }
    else {
        rep.int(0L, length(column_names))
    }
    column_flags <- workspace_schema_column_flags(
        object$value,
        column_names,
        object$name
    )

    list(
        ok = TRUE,
        result = list(
            name = object$name,
            rowCount = as.integer(row_count %||% 0L),
            columnCount = as.integer(
                column_count %||% length(column_names)
            ),
            columns = workspace_schema_column_json(
                column_names,
                column_types,
                column_decimals,
                column_flags
            )
        )
    )
}

workspace_dataset_column_decimals <- function(column) {
    decimals <- suppressWarnings(as.integer(
        dataset_attribute(column, "decimals")[[1]] %||% NA_integer_
    ))

    if (is.finite(decimals) && !is.na(decimals)) {
        return(max(0L, min(8L, decimals)))
    }

    if (!is.null(column) && is.numeric(column)) {
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
            return(3L)
        }

        return(0L)
    }

    labels <- dataset_attribute(column, "labels")

    if (!is.null(labels) && length(labels)) {
        return(0L)
    }

    0L
}


workspace_dataset_clamp_decimals <- function(decimals, width) {
    decimals <- suppressWarnings(as.integer(decimals %||% 0L))
    width <- suppressWarnings(as.integer(width %||% 1L))

    if (!is.finite(decimals) || is.na(decimals)) {
        decimals <- 0L
    }

    if (!is.finite(width) || is.na(width)) {
        width <- 1L
    }

    max(0L, min(8L, decimals, max(0L, width - 2L)))
}


cell_numeric_text <- function(cell) {
    text <- format(
        cell,
        scientific = FALSE,
        trim = TRUE,
        digits = 15
    )

    if (grepl("\\.", text)) {
        text <- sub("0+$", "", text)
        text <- sub("\\.$", "", text)
    }

    if (!nzchar(text)) {
        return("0")
    }

    text
}


cell_scalar_value_text <- function(cell) {
    if (is.null(cell)) {
        return("NULL")
    }

    if (length(cell) == 1L && is.factor(cell)) {
        return(as.character(cell))
    }

    if (length(cell) == 1L && is.numeric(cell) && !is.na(cell)) {
        return(cell_numeric_text(cell))
    }

    if (length(cell) == 1L && is.atomic(cell)) {
        return(as.character(cell))
    }

    paste(
        utils::capture.output(utils::str(
            cell,
            max.level = 1L,
            give.attr = FALSE
        )),
        collapse = " "
    )
}


cell_scalar_text <- function(cell) {
    text <- tryCatch(
        cell_scalar_value_text(cell),
        error = function(error) ""
    )

    if (length(text) > 1L) {
        text <- paste(text, collapse = " ")
    }

    text <- as.character(text %||% "")
    text <- as.character(text[[1]] %||% "")

    if (!nzchar(text) && length(cell) == 1L) {
        text <- tryCatch(
            as.character(cell),
            error = function(error) ""
        )
        text <- paste(text, collapse = " ")
        text <- as.character(text[[1]] %||% "")
    }

    if (is.na(text)) {
        text <- "NA"
    }

    if (nchar(text, type = "chars") > 160L) {
        text <- paste0(substr(text, 1L, 160L), "...")
    }

    text
}


cell_to_json <- function(cell) {
    json_str(cell_scalar_text(cell))
}


cell_is_declared_missing_value <- function(source_column, cell) {
    missing_values <- dataset_attribute(source_column, "na_values")

    if (is.null(missing_values) || !length(missing_values)) {
        return(FALSE)
    }

    is.element(
        as.character(cell),
        as.character(missing_values)
    )
}


cell_is_declared_missing_range <- function(source_column, cell) {
    missing_range <- dataset_attribute(source_column, "na_range")

    if (is.null(missing_range) || length(missing_range) < 2L) {
        return(FALSE)
    }

    cell_number <- suppressWarnings(as.numeric(as.character(cell)))
    minimum <- suppressWarnings(as.numeric(missing_range[[1]]))
    maximum <- suppressWarnings(as.numeric(missing_range[[2]]))

    if (
        !is.finite(cell_number) ||
        !is.finite(minimum) ||
        !is.finite(maximum)
    ) {
        return(FALSE)
    }

    cell_number >= min(minimum, maximum) &&
        cell_number <= max(minimum, maximum)
}


cell_is_declared_missing <- function(source_column, cell) {
    if (
        is.null(source_column) ||
        length(cell) != 1L ||
        is.na(cell)
    ) {
        return(FALSE)
    }

    cell_is_declared_missing_value(source_column, cell) ||
        cell_is_declared_missing_range(source_column, cell)
}


declared_missing_cell_json <- function(cell) {
    raw_value <- cell_scalar_text(cell)

    paste0(
        "{",
        "\"display\":", json_str(paste0("NA(", raw_value, ")")), ",",
        "\"raw\":", json_str(raw_value), ",",
        "\"declaredMissing\":true",
        "}"
    )
}


declared_missing_index_value <- function(source_column, source_index) {
    missing_index <- dataset_attribute(source_column, "na_index")

    if (
        is.null(missing_index) ||
        !length(missing_index) ||
        !any(missing_index == source_index, na.rm = TRUE)
    ) {
        return(NULL)
    }

    declared_index <- match(source_index, missing_index)
    declared_names <- names(missing_index)

    if (
        is.null(declared_names) ||
        length(declared_names) < declared_index
    ) {
        return("")
    }

    as.character(declared_names[[declared_index]] %||% "")
}


empty_cell_json <- function() {
    "{\"display\":\"\",\"raw\":\"\"}"
}


cell_state_json <- function(source_column, source_index) {
    if (
        is.null(source_column) ||
        !is.finite(source_index) ||
        is.na(source_index) ||
        source_index < 1L ||
        length(source_column) < source_index
    ) {
        return(empty_cell_json())
    }

    cell <- tryCatch(
        source_column[[source_index]],
        error = function(error) source_column[source_index]
    )

    if (length(cell) == 1L && is.na(cell)) {
        declared_value <- declared_missing_index_value(
            source_column,
            source_index
        )

        if (!is.null(declared_value)) {
            return(declared_missing_cell_json(declared_value))
        }

        return(empty_cell_json())
    }

    if (isTRUE(cell_is_declared_missing(source_column, cell))) {
        return(declared_missing_cell_json(cell))
    }

    value_json <- cell_to_json(cell)

    paste0(
        "{",
        "\"display\":", value_json, ",",
        "\"raw\":", value_json,
        "}"
    )
}


workspace_tabular_object <- function(name) {
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

    dimensions <- tryCatch(dim(value), error = function(error) NULL)
    is_tabular <- is.data.frame(value) ||
        is.matrix(value) ||
        (is.array(value) && length(dimensions) == 2L)

    if (!isTRUE(is_tabular)) {
        return(list(ok = FALSE, error = "workspace-object-not-tabular"))
    }

    table_value <- if (is.data.frame(value)) {
        value
    }
    else {
        tryCatch(
            as.data.frame(
                value,
                stringsAsFactors = FALSE,
                check.names = FALSE
            ),
            error = function(error) error
        )
    }

    if (inherits(table_value, "error")) {
        return(list(
            ok = FALSE,
            error = as.character(conditionMessage(table_value))
        ))
    }

    list(ok = TRUE, value = table_value)
}


workspace_dataset_column_names <- function(value) {
    columns <- tryCatch(
        colnames(value),
        error = function(error) NULL
    )

    if (!is.null(columns) && length(columns)) {
        return(as.character(columns))
    }

    columns <- paste0("V", seq_len(max(1L, ncol(value))))
    colnames(value) <- columns
    as.character(columns)
}


workspace_dataset_requested_columns <- function(
    all_columns,
    requested_columns,
    column_count = 8L
) {
    requested_columns <- as.character(requested_columns %||% character(0))

    if (length(requested_columns)) {
        return(intersect(requested_columns, all_columns))
    }

    column_count <- suppressWarnings(as.integer(column_count))

    if (is.na(column_count) || column_count < 1L) {
        column_count <- 8L
    }

    as.character(utils::head(all_columns, column_count))
}


workspace_dataset_page_bounds <- function(row_start, row_count, total_rows) {
    row_start <- suppressWarnings(as.integer(row_start %||% 1L))
    row_count <- suppressWarnings(as.integer(row_count %||% 50L))
    total_rows <- dataset_dimension_count(total_rows)

    if (!is.finite(row_start) || is.na(row_start) || row_start < 1L) {
        row_start <- 1L
    }

    if (!is.finite(row_count) || is.na(row_count) || row_count < 1L) {
        row_count <- 50L
    }

    row_count <- min(row_count, 500L)
    first <- min(row_start, max(1L, total_rows + 1L))
    last <- min(total_rows, first + row_count - 1L)

    list(
        first = first,
        last = last,
        count = if (total_rows > 0L && last >= first) {
            last - first + 1L
        }
        else {
            0L
        },
        total = total_rows
    )
}


workspace_dataset_column_json <- function(value, columns) {
    entries <- vapply(columns, function(column_name) {
        column <- tryCatch(
            value[[column_name]],
            error = function(error) NULL
        )
        column_type <- if (is.null(column)) {
            "unknown"
        }
        else {
            paste(
                as.character(class(column) %||% typeof(column)),
                collapse = "/"
            )
        }

        paste0(
            "{",
            "\"name\":", json_str(column_name), ",",
            "\"type\":", json_str(column_type), ",",
            "\"decimals\":", json_num(
                workspace_dataset_column_decimals(column)
            ),
            "}"
        )
    }, character(1))

    paste0("[", paste(entries, collapse = ","), "]")
}


workspace_dataset_row_json <- function(value, columns, source_index) {
    cells <- vapply(columns, function(column_name) {
        source_column <- tryCatch(
            value[[column_name]],
            error = function(error) NULL
        )

        cell_state_json(source_column, source_index)
    }, character(1))

    paste0("[", paste(cells, collapse = ","), "]")
}


workspace_dataset_rows_json <- function(value, columns, page) {
    if (page$count < 1L) {
        return("[]")
    }

    rows <- vapply(seq_len(page$count), function(page_index) {
        workspace_dataset_row_json(
            value,
            columns,
            page$first + page_index - 1L
        )
    }, character(1))

    paste0("[", paste(rows, collapse = ","), "]")
}


workspace_dataset_row_names <- function(value, page) {
    row_names <- tryCatch(
        rownames(value),
        error = function(error) NULL
    )

    if (is.null(row_names) || length(row_names) != page$total) {
        row_names <- as.character(seq_len(page$total))
    }

    if (page$count < 1L) {
        return(character(0))
    }

    as.character(row_names[page$first:page$last])
}


workspace_dataset_content <- function(
    name,
    row_start,
    row_count,
    columns,
    column_count = 8L
) {
    dataset <- workspace_tabular_object(name)

    if (!isTRUE(dataset$ok)) {
        return(dataset)
    }

    value <- dataset$value
    all_columns <- workspace_dataset_column_names(value)
    selected_columns <- workspace_dataset_requested_columns(
        all_columns,
        columns,
        column_count
    )

    if (!length(selected_columns)) {
        return(list(
            ok = FALSE,
            error = "workspace-dataset-columns-empty"
        ))
    }

    page <- workspace_dataset_page_bounds(
        row_start,
        row_count,
        nrow(value)
    )
    row_names <- workspace_dataset_row_names(value, page)
    row_names_json <- if (length(row_names)) {
        paste0(
            "[",
            paste(vapply(row_names, json_str, character(1)), collapse = ","),
            "]"
        )
    }
    else {
        "[]"
    }
    columns_json <- workspace_dataset_column_json(value, selected_columns)
    rows_json <- workspace_dataset_rows_json(value, selected_columns, page)
    result_json <- paste0(
        "{",
        "\"name\":", json_str(name), ",",
        "\"rowStart\":", json_num(page$first), ",",
        "\"rowCount\":", json_num(page$count), ",",
        "\"totalRowCount\":", json_num(page$total), ",",
        "\"columnCount\":", json_num(length(selected_columns)), ",",
        "\"totalColumnCount\":", json_num(length(all_columns)), ",",
        "\"columns\":", columns_json, ",",
        "\"rowNames\":", row_names_json, ",",
        "\"rows\":", rows_json,
        "}"
    )

    list(
        ok = TRUE,
        result = list(
            name = name,
            rowStart = page$first,
            rowCount = page$count,
            totalRowCount = page$total,
            columnCount = length(selected_columns)
        ),
        result_json = result_json
    )
}
workspace_filter_page_bounds <- function(row_start, row_count, total_rows) {
    row_start <- suppressWarnings(as.integer(row_start %||% 1L))
    row_count <- suppressWarnings(as.integer(row_count %||% 50L))
    total_rows <- dataset_dimension_count(total_rows)

    if (!is.finite(row_start) || is.na(row_start) || row_start < 1L) {
        row_start <- 1L
    }

    if (!is.finite(row_count) || is.na(row_count) || row_count < 0L) {
        row_count <- 0L
    }

    row_count <- min(row_count, 500L)
    first <- min(row_start, max(1L, total_rows + 1L))
    last <- min(
        total_rows,
        max(first - 1L, first + row_count - 1L)
    )

    list(
        first = first,
        last = last,
        count = if (total_rows > 0L && last >= first) {
            last - first + 1L
        }
        else {
            0L
        }
    )
}


workspace_filter_result <- function(name, page, filtered_out) {
    filtered_json <- if (length(filtered_out)) {
        paste0(
            "[",
            paste(
                vapply(filtered_out, json_bool, character(1)),
                collapse = ","
            ),
            "]"
        )
    }
    else {
        "[]"
    }
    result_json <- paste0(
        "{",
        "\"name\":", json_str(name), ",",
        "\"rowStart\":", json_num(page$first), ",",
        "\"rowCount\":", json_num(page$count), ",",
        "\"filteredOut\":", filtered_json,
        "}"
    )

    list(
        ok = TRUE,
        result = list(
            name = name,
            rowStart = page$first,
            rowCount = page$count
        ),
        result_json = result_json
    )
}


workspace_filter_expressions <- function(command) {
    parsed <- tryCatch(
        parse(text = command),
        error = function(error) error
    )

    if (inherits(parsed, "error") || !length(parsed) || !is.call(parsed[[1]])) {
        return(list(ok = FALSE, error = "invalid-filter-command"))
    }

    arguments <- as.list(parsed[[1]])[-1L]
    argument_names <- names(arguments) %||% rep("", length(arguments))
    data_expression <- NULL

    if (is.element("x", argument_names)) {
        data_expression <- arguments[[which(argument_names == "x")[[1]]]]
    }
    else if (is.element("data", argument_names)) {
        data_expression <- arguments[[which(argument_names == "data")[[1]]]]
    }
    else if (length(arguments)) {
        data_expression <- arguments[[1]]
    }

    if (is.null(data_expression)) {
        return(list(ok = FALSE, error = "invalid-filter-command"))
    }

    subset_expression <- NULL

    if (is.element("subset", argument_names)) {
        subset_expression <- arguments[[which(argument_names == "subset")[[1]]]]
    }
    else {
        unnamed <- which(!nzchar(argument_names))

        if (length(unnamed) >= 2L) {
            subset_expression <- arguments[[unnamed[[2]]]]
        }
    }

    list(
        ok = TRUE,
        data = data_expression,
        subset = subset_expression
    )
}


workspace_filter_keep_vector <- function(data, subset_expression) {
    row_count <- dataset_dimension_count(nrow(data))

    if (is.null(subset_expression)) {
        return(list(ok = TRUE, keep = rep(TRUE, row_count)))
    }

    subset_value <- tryCatch(
        eval(subset_expression, envir = data, enclos = .GlobalEnv),
        error = function(error) error
    )

    if (inherits(subset_value, "error")) {
        return(list(
            ok = FALSE,
            error = as.character(conditionMessage(subset_value))
        ))
    }

    if (is.matrix(subset_value) || is.data.frame(subset_value)) {
        subset_value <- subset_value[, 1L, drop = TRUE]
    }

    if (is.logical(subset_value)) {
        keep <- rep_len(subset_value, row_count)
    }
    else if (is.numeric(subset_value)) {
        keep <- rep(FALSE, row_count)
        indexes <- suppressWarnings(as.integer(subset_value))
        indexes <- indexes[
            is.finite(indexes) &
            !is.na(indexes) &
            indexes >= 1L &
            indexes <= row_count
        ]

        if (length(indexes)) {
            keep[indexes] <- TRUE
        }
    }
    else {
        keep <- as.logical(rep_len(subset_value, row_count))
    }

    keep[is.na(keep)] <- FALSE

    list(ok = TRUE, keep = keep)
}


workspace_dataset_filter_mask <- function(name, command, row_start, row_count) {
    name <- as.character(name %||% "")
    command <- as.character(command %||% "")

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

    if (!is.data.frame(value)) {
        return(list(ok = FALSE, error = "workspace-object-not-dataset"))
    }

    page <- workspace_filter_page_bounds(
        row_start,
        row_count,
        nrow(value)
    )

    if (!nzchar(trimws(command))) {
        return(workspace_filter_result(
            name,
            page,
            rep(FALSE, page$count)
        ))
    }

    expressions <- workspace_filter_expressions(command)

    if (!isTRUE(expressions$ok)) {
        return(expressions)
    }

    data <- tryCatch(
        eval(expressions$data, envir = .GlobalEnv, enclos = baseenv()),
        error = function(error) error
    )

    if (inherits(data, "error")) {
        return(list(
            ok = FALSE,
            error = as.character(conditionMessage(data))
        ))
    }

    if (!is.data.frame(data)) {
        return(list(ok = FALSE, error = "workspace-object-not-dataset"))
    }

    keep_result <- workspace_filter_keep_vector(data, expressions$subset)

    if (!isTRUE(keep_result$ok)) {
        return(keep_result)
    }

    keep <- keep_result$keep
    filtered_out <- if (
        page$count > 0L &&
        length(keep) >= page$last
    ) {
        !keep[page$first:page$last]
    }
    else {
        rep(FALSE, page$count)
    }

    workspace_filter_result(name, page, filtered_out)
}
workspace_editable_dataset <- function(name) {
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

    if (!is.data.frame(value)) {
        return(list(ok = FALSE, error = "workspace-object-not-dataset"))
    }

    list(
        ok = TRUE,
        name = name,
        value = value,
        columns = workspace_dataset_column_names(value)
    )
}


workspace_dataset_assign <- function(dataset, value) {
    assign(dataset$name, value, envir = .GlobalEnv)
    invisible(value)
}


workspace_dataset_valid_row <- function(row) {
    row <- suppressWarnings(as.integer(row %||% 0L))

    if (!is.finite(row) || is.na(row) || row < 1L) {
        return(NA_integer_)
    }

    row
}


workspace_dataset_position <- function(position) {
    position <- tolower(trimws(as.character(position %||% "after")))

    if (!is.element(position, c("before", "after"))) {
        return("after")
    }

    position
}


workspace_dataset_column <- function(dataset, column) {
    column <- as.character(column %||% "")

    if (!nzchar(column)) {
        return(list(ok = FALSE, error = "missing-column-name"))
    }

    if (!is.element(column, dataset$columns)) {
        return(list(
            ok = FALSE,
            error = "workspace-dataset-column-not-found"
        ))
    }

    value <- tryCatch(
        dataset$value[[column]],
        error = function(error) error
    )

    if (inherits(value, "error")) {
        return(list(
            ok = FALSE,
            error = as.character(conditionMessage(value))
        ))
    }

    list(
        ok = TRUE,
        name = column,
        index = match(column, dataset$columns),
        value = value
    )
}


workspace_dataset_declared_attributes <- function(column) {
    list(
        label = tryCatch(
            attr(column, "label", exact = TRUE),
            error = function(error) NULL
        ),
        labels = tryCatch(
            attr(column, "labels", exact = TRUE),
            error = function(error) NULL
        ),
        na_values = tryCatch(
            attr(column, "na_values", exact = TRUE),
            error = function(error) NULL
        ),
        na_range = tryCatch(
            attr(column, "na_range", exact = TRUE),
            error = function(error) NULL
        ),
        measurement = tryCatch(
            attr(column, "measurement", exact = TRUE),
            error = function(error) NULL
        )
    )
}


workspace_dataset_undeclare_column <- function(column, declared_namespace) {
    if (is.null(declared_namespace) || !inherits(column, "declared")) {
        return(column)
    }

    tryCatch(
        get("undeclare", envir = declared_namespace)(column, drop = TRUE),
        error = function(error) column
    )
}


workspace_dataset_base_class <- function(column) {
    classes <- as.character(class(column) %||% typeof(column))
    classes <- classes[
        !is.na(classes) &
            nzchar(classes) &
            classes != "declared"
    ]

    if (length(classes)) {
        return(classes[[1]])
    }

    as.character(typeof(column) %||% "character")
}


workspace_dataset_logical_value <- function(text) {
    token <- trimws(tolower(text))

    if (is.element(token, c("true", "t", "1", "yes", "y"))) {
        return(TRUE)
    }

    if (is.element(token, c("false", "f", "0", "no", "n"))) {
        return(FALSE)
    }

    NA
}


workspace_dataset_scalar_value <- function(text, base_class) {
    if (!nzchar(text)) {
        return(NA)
    }

    if (identical(base_class, "Date")) {
        return(suppressWarnings(as.Date(text)))
    }

    if (identical(base_class, "logical")) {
        return(workspace_dataset_logical_value(text))
    }

    if (identical(base_class, "integer")) {
        return(suppressWarnings(as.integer(text)))
    }

    if (identical(base_class, "numeric")) {
        return(suppressWarnings(as.numeric(text)))
    }

    as.character(text)
}


workspace_dataset_attribute_text <- function(value) {
    if (is.null(value) || !length(value)) {
        return(NULL)
    }

    as.character(value[[1]])
}


workspace_dataset_redeclare_column <- function(
    source,
    attributes,
    declared_namespace
) {
    rebuilt <- tryCatch(
        get("declared", envir = declared_namespace)(
            source,
            labels = attributes$labels,
            na_values = attributes$na_values,
            na_range = attributes$na_range,
            label = workspace_dataset_attribute_text(attributes$label),
            measurement = workspace_dataset_attribute_text(
                attributes$measurement
            )
        ),
        error = function(error) error
    )

    if (inherits(rebuilt, "error")) {
        return(list(
            ok = FALSE,
            error = as.character(conditionMessage(rebuilt))
        ))
    }

    list(ok = TRUE, value = rebuilt)
}


workspace_dataset_update_cell <- function(name, row, column, value = "") {
    dataset <- workspace_editable_dataset(name)

    if (!isTRUE(dataset$ok)) {
        return(dataset)
    }

    row <- workspace_dataset_valid_row(row)

    if (is.na(row)) {
        return(list(ok = FALSE, error = "invalid-row-index"))
    }

    column_state <- workspace_dataset_column(dataset, column)

    if (!isTRUE(column_state$ok)) {
        return(column_state)
    }

    if (row > nrow(dataset$value)) {
        return(list(
            ok = FALSE,
            error = "workspace-dataset-row-out-of-range"
        ))
    }

    text <- as.character(value %||% "")
    declared_namespace <- if (
        requireNamespace("declared", quietly = TRUE)
    ) {
        asNamespace("declared")
    }
    else {
        NULL
    }
    source <- workspace_dataset_undeclare_column(
        column_state$value,
        declared_namespace
    )
    base_class <- workspace_dataset_base_class(source)
    next_value <- workspace_dataset_scalar_value(text, base_class)

    if (
        nzchar(text) &&
        is.na(next_value) &&
        !identical(base_class, "character")
    ) {
        return(list(
            ok = FALSE,
            error = "dataset-cell-conversion-failed"
        ))
    }

    source[[row]] <- next_value
    updated_column <- source

    if (
        !is.null(declared_namespace) &&
        inherits(column_state$value, "declared")
    ) {
        rebuilt <- workspace_dataset_redeclare_column(
            source,
            workspace_dataset_declared_attributes(column_state$value),
            declared_namespace
        )

        if (!isTRUE(rebuilt$ok)) {
            return(rebuilt)
        }

        updated_column <- rebuilt$value
    }

    dataset$value[[column_state$name]] <- updated_column
    workspace_dataset_assign(dataset, dataset$value)

    list(
        ok = TRUE,
        result = list(row = row, column = column_state$name),
        result_json = cell_state_json(updated_column, row)
    )
}


workspace_dataset_sort_command <- function(
    name,
    column,
    decreasing,
    na_last,
    empty_last
) {
    paste(
        "local({",
        paste0("  .__dm_data__ <- ", r_ident(name)),
        paste0(
            "  .__dm_sort_col__ <- .__dm_data__[[",
            json_str(column),
            "]]"
        ),
        paste0(
            "  .__dm_sort_ord__ <- if (requireNamespace(\"declared\", ",
            "quietly=TRUE) && inherits(.__dm_sort_col__, \"declared\")) ",
            "declared::order_declared(.__dm_sort_col__, na.last = ",
            if (na_last) "TRUE" else "FALSE",
            ", decreasing = ",
            if (decreasing) "TRUE" else "FALSE",
            ", empty.last = ",
            if (empty_last) "TRUE" else "FALSE",
            ") else order(.__dm_sort_col__, na.last = ",
            if (na_last) "TRUE" else "FALSE",
            ", decreasing = ",
            if (decreasing) "TRUE" else "FALSE",
            ")"
        ),
        paste0(
            "  assign(",
            json_str(name),
            ", .__dm_data__[.__dm_sort_ord__, , drop = FALSE], ",
            "envir = .GlobalEnv)"
        ),
        "})",
        sep = "\n"
    )
}


workspace_dataset_sort_order <- function(
    column,
    decreasing,
    na_last,
    empty_last
) {
    tryCatch({
        if (
            requireNamespace("declared", quietly = TRUE) &&
            inherits(column, "declared")
        ) {
            return(declared::order_declared(
                column,
                na.last = na_last,
                decreasing = decreasing,
                empty.last = empty_last
            ))
        }

        order(
            column,
            na.last = na_last,
            decreasing = decreasing
        )
    }, error = function(error) error)
}


workspace_dataset_sort_rows <- function(
    name,
    column,
    decreasing = FALSE,
    na_last = TRUE,
    empty_last = TRUE
) {
    dataset <- workspace_editable_dataset(name)

    if (!isTRUE(dataset$ok)) {
        return(dataset)
    }

    column_state <- workspace_dataset_column(dataset, column)

    if (!isTRUE(column_state$ok)) {
        return(column_state)
    }

    decreasing <- isTRUE(decreasing)
    na_last <- !identical(na_last, FALSE)
    empty_last <- !identical(empty_last, FALSE)
    command <- workspace_dataset_sort_command(
        dataset$name,
        column_state$name,
        decreasing,
        na_last,
        empty_last
    )
    sort_order <- workspace_dataset_sort_order(
        column_state$value,
        decreasing,
        na_last,
        empty_last
    )

    if (inherits(sort_order, "error")) {
        return(list(
            ok = FALSE,
            error = as.character(conditionMessage(sort_order))
        ))
    }

    dataset$value <- dataset$value[sort_order, , drop = FALSE]
    workspace_dataset_assign(dataset, dataset$value)
    row_count <- dataset_dimension_count(nrow(dataset$value))
    result_json <- paste0(
        "{",
        "\"name\":", json_str(dataset$name), ",",
        "\"column\":", json_str(column_state$name), ",",
        "\"decreasing\":", json_bool(decreasing), ",",
        "\"rowCount\":", json_num(row_count), ",",
        "\"command\":", json_str(command),
        "}"
    )

    list(
        ok = TRUE,
        result = list(
            name = dataset$name,
            column = column_state$name,
            decreasing = decreasing,
            rowCount = row_count,
            command = command
        ),
        result_json = result_json
    )
}


workspace_dataset_remove_column <- function(name, column) {
    dataset <- workspace_editable_dataset(name)

    if (!isTRUE(dataset$ok)) {
        return(dataset)
    }

    column_state <- workspace_dataset_column(dataset, column)

    if (!isTRUE(column_state$ok)) {
        return(column_state)
    }

    dataset$value[[column_state$index]] <- NULL
    workspace_dataset_assign(dataset, dataset$value)
    column_count <- dataset_dimension_count(ncol(dataset$value))
    result_json <- paste0(
        "{",
        "\"column\":", json_str(column_state$name), ",",
        "\"columnCount\":", json_num(column_count),
        "}"
    )

    list(
        ok = TRUE,
        result = list(
            column = column_state$name,
            columnCount = column_count
        ),
        result_json = result_json
    )
}


workspace_dataset_unique_column_name <- function(
    requested_name,
    insert_at,
    existing_names
) {
    requested_name <- as.character(requested_name %||% "")

    if (!nzchar(requested_name)) {
        requested_name <- paste0("V", insert_at)
    }

    if (!is.element(requested_name, existing_names)) {
        return(requested_name)
    }

    suffix <- suppressWarnings(as.integer(sub("^V", "", requested_name)))

    if (!is.finite(suffix) || is.na(suffix) || suffix < 1L) {
        suffix <- insert_at
    }

    candidate <- paste0("V", suffix)

    while (is.element(candidate, existing_names)) {
        suffix <- suffix + 1L
        candidate <- paste0("V", suffix)
    }

    candidate
}


workspace_dataset_insert_column <- function(
    name,
    column,
    next_name = "",
    position = "after"
) {
    dataset <- workspace_editable_dataset(name)

    if (!isTRUE(dataset$ok)) {
        return(dataset)
    }

    column_state <- workspace_dataset_column(dataset, column)

    if (!isTRUE(column_state$ok)) {
        return(column_state)
    }

    position <- workspace_dataset_position(position)
    insert_at <- if (identical(position, "before")) {
        column_state$index
    }
    else {
        column_state$index + 1L
    }
    insert_at <- max(1L, min(insert_at, length(dataset$columns) + 1L))
    next_name <- workspace_dataset_unique_column_name(
        next_name,
        insert_at,
        dataset$columns
    )

    dataset$value[[next_name]] <- rep(NA, nrow(dataset$value))
    appended_index <- ncol(dataset$value)
    inserted_index <- appended_index

    if (insert_at <= appended_index - 1L) {
        before <- if (insert_at > 1L) seq_len(insert_at - 1L) else integer(0)
        after <- seq.int(insert_at, appended_index - 1L)
        order_index <- c(before, appended_index, after)
        dataset$value <- dataset$value[, order_index, drop = FALSE]
        inserted_index <- insert_at
    }

    workspace_dataset_assign(dataset, dataset$value)
    column_count <- dataset_dimension_count(ncol(dataset$value))
    result_json <- paste0(
        "{",
        "\"name\":", json_str(dataset$name), ",",
        "\"column\":", json_str(column_state$name), ",",
        "\"nextName\":", json_str(next_name), ",",
        "\"position\":", json_str(position), ",",
        "\"columnIndex\":", json_num(inserted_index), ",",
        "\"columnCount\":", json_num(column_count),
        "}"
    )

    list(
        ok = TRUE,
        result = list(
            name = dataset$name,
            column = column_state$name,
            nextName = next_name,
            position = position,
            columnIndex = inserted_index,
            columnCount = column_count
        ),
        result_json = result_json
    )
}


workspace_dataset_update_column_name <- function(
    name,
    column,
    next_name = ""
) {
    dataset <- workspace_editable_dataset(name)

    if (!isTRUE(dataset$ok)) {
        return(dataset)
    }

    column_state <- workspace_dataset_column(dataset, column)

    if (!isTRUE(column_state$ok)) {
        return(column_state)
    }

    next_name <- as.character(next_name %||% "")

    if (!nzchar(next_name)) {
        return(list(ok = FALSE, error = "missing-next-column-name"))
    }

    if (
        is.element(next_name, dataset$columns) &&
        !identical(next_name, column_state$name)
    ) {
        return(list(
            ok = FALSE,
            error = "workspace-dataset-column-name-exists"
        ))
    }

    dataset$columns[[column_state$index]] <- next_name
    colnames(dataset$value) <- dataset$columns
    workspace_dataset_assign(dataset, dataset$value)
    result_json <- paste0(
        "{",
        "\"column\":", json_str(column_state$name), ",",
        "\"name\":", json_str(next_name),
        "}"
    )

    list(
        ok = TRUE,
        result = list(column = column_state$name, name = next_name),
        result_json = result_json
    )
}


workspace_dataset_all_row_names <- function(value) {
    row_names <- tryCatch(
        rownames(value),
        error = function(error) NULL
    )
    row_count <- dataset_dimension_count(nrow(value))

    if (is.null(row_names) || length(row_names) != row_count) {
        return(as.character(seq_len(row_count)))
    }

    as.character(row_names)
}


workspace_dataset_update_row_name <- function(name, row, next_name = "") {
    dataset <- workspace_editable_dataset(name)

    if (!isTRUE(dataset$ok)) {
        return(dataset)
    }

    row <- workspace_dataset_valid_row(row)

    if (is.na(row)) {
        return(list(ok = FALSE, error = "invalid-row-index"))
    }

    if (row > nrow(dataset$value)) {
        return(list(
            ok = FALSE,
            error = "workspace-dataset-row-out-of-range"
        ))
    }

    next_name <- as.character(next_name %||% "")

    if (!nzchar(next_name)) {
        return(list(ok = FALSE, error = "missing-next-row-name"))
    }

    row_names <- workspace_dataset_all_row_names(dataset$value)
    row_names[[row]] <- next_name
    rownames(dataset$value) <- row_names
    workspace_dataset_assign(dataset, dataset$value)
    result_json <- paste0(
        "{",
        "\"row\":", json_num(row), ",",
        "\"name\":", json_str(next_name),
        "}"
    )

    list(
        ok = TRUE,
        result = list(row = row, name = next_name),
        result_json = result_json
    )
}


workspace_dataset_unique_row_name <- function(
    requested_name,
    insert_at,
    existing_names
) {
    requested_name <- as.character(requested_name %||% "")

    if (!nzchar(requested_name)) {
        requested_name <- as.character(insert_at)
    }

    if (!is.element(requested_name, existing_names)) {
        return(requested_name)
    }

    suffix <- suppressWarnings(as.integer(requested_name))

    if (!is.finite(suffix) || is.na(suffix) || suffix < 1L) {
        suffix <- insert_at
    }

    candidate <- as.character(suffix)

    while (is.element(candidate, existing_names)) {
        suffix <- suffix + 1L
        candidate <- as.character(suffix)
    }

    candidate
}


workspace_dataset_empty_row <- function(value) {
    row <- as.data.frame(
        lapply(value, function(column) column[NA_integer_]),
        stringsAsFactors = FALSE
    )
    names(row) <- colnames(value)
    row
}


workspace_dataset_insert_row <- function(
    name,
    row,
    next_name = "",
    position = "after"
) {
    dataset <- workspace_editable_dataset(name)

    if (!isTRUE(dataset$ok)) {
        return(dataset)
    }

    row <- workspace_dataset_valid_row(row)

    if (is.na(row)) {
        return(list(ok = FALSE, error = "invalid-row-index"))
    }

    row_count <- dataset_dimension_count(nrow(dataset$value))

    if (row > row_count) {
        return(list(
            ok = FALSE,
            error = "workspace-dataset-row-out-of-range"
        ))
    }

    position <- workspace_dataset_position(position)
    insert_at <- if (identical(position, "before")) row else row + 1L
    insert_at <- max(1L, min(insert_at, row_count + 1L))
    row_names <- workspace_dataset_all_row_names(dataset$value)
    next_name <- workspace_dataset_unique_row_name(
        next_name,
        insert_at,
        row_names
    )
    before <- if (insert_at > 1L) {
        dataset$value[seq_len(insert_at - 1L), , drop = FALSE]
    }
    else {
        dataset$value[0, , drop = FALSE]
    }
    after <- if (insert_at <= row_count) {
        dataset$value[seq.int(insert_at, row_count), , drop = FALSE]
    }
    else {
        dataset$value[0, , drop = FALSE]
    }

    dataset$value <- rbind(
        before,
        workspace_dataset_empty_row(dataset$value),
        after
    )
    rownames(dataset$value) <- c(
        if (insert_at > 1L) {
            row_names[seq_len(insert_at - 1L)]
        }
        else {
            character(0)
        },
        next_name,
        if (insert_at <= row_count) {
            row_names[seq.int(insert_at, row_count)]
        }
        else {
            character(0)
        }
    )
    workspace_dataset_assign(dataset, dataset$value)
    result_row_count <- dataset_dimension_count(nrow(dataset$value))
    result_json <- paste0(
        "{",
        "\"name\":", json_str(dataset$name), ",",
        "\"row\":", json_num(insert_at), ",",
        "\"nextName\":", json_str(next_name), ",",
        "\"position\":", json_str(position), ",",
        "\"rowCount\":", json_num(result_row_count),
        "}"
    )

    list(
        ok = TRUE,
        result = list(
            name = dataset$name,
            row = insert_at,
            nextName = next_name,
            position = position,
            rowCount = result_row_count
        ),
        result_json = result_json
    )
}


workspace_dataset_remove_row <- function(name, row) {
    dataset <- workspace_editable_dataset(name)

    if (!isTRUE(dataset$ok)) {
        return(dataset)
    }

    row <- workspace_dataset_valid_row(row)

    if (is.na(row)) {
        return(list(ok = FALSE, error = "invalid-row-index"))
    }

    row_count <- dataset_dimension_count(nrow(dataset$value))

    if (row > row_count) {
        return(list(
            ok = FALSE,
            error = "workspace-dataset-row-out-of-range"
        ))
    }

    if (row_count <= 1L) {
        return(list(
            ok = FALSE,
            error = "workspace-dataset-last-row-protected"
        ))
    }

    keep <- seq_len(row_count)
    keep <- keep[keep != row]
    dataset$value <- dataset$value[keep, , drop = FALSE]
    workspace_dataset_assign(dataset, dataset$value)
    result_row_count <- dataset_dimension_count(nrow(dataset$value))
    result_json <- paste0(
        "{",
        "\"name\":", json_str(dataset$name), ",",
        "\"row\":", json_num(row), ",",
        "\"rowCount\":", json_num(result_row_count),
        "}"
    )

    list(
        ok = TRUE,
        result = list(
            name = dataset$name,
            row = row,
            rowCount = result_row_count
        ),
        result_json = result_json
    )
}
workspace_declared_namespace <- function() {
    if (!requireNamespace("declared", quietly = TRUE)) {
        return(NULL)
    }

    asNamespace("declared")
}


workspace_dataset_attribute <- function(column, name) {
    tryCatch(
        attr(column, name, exact = TRUE),
        error = function(error) NULL
    )
}


workspace_dataset_category_count <- function(column, labels) {
    if (!is.null(labels) && length(labels)) {
        return(length(as.character(labels)))
    }

    if (!is.null(column) && is.factor(column)) {
        return(length(tryCatch(
            levels(column),
            error = function(error) character(0)
        )))
    }

    0L
}


workspace_dataset_likely_measure <- function(column) {
    declared_namespace <- workspace_declared_namespace()

    if (is.null(declared_namespace)) {
        return("")
    }

    measure <- tryCatch(
        as.character(
            get("likely_measurement", envir = declared_namespace)(column) %||%
                ""
        ),
        error = function(error) ""
    )

    trimws(measure)
}


workspace_dataset_measure <- function(
    column,
    measure_attribute = NULL,
    labels_attribute = NULL
) {
    explicit_measure <- workspace_dataset_attribute_text(measure_attribute)

    if (!is.null(explicit_measure) && nzchar(trimws(explicit_measure))) {
        return(trimws(explicit_measure))
    }

    category_count <- workspace_dataset_category_count(
        column,
        labels_attribute
    )
    likely_measure <- workspace_dataset_likely_measure(column)

    if (identical(likely_measure, "quantitative")) {
        return("interval")
    }

    if (identical(likely_measure, "categorical")) {
        if (!is.null(column) && is.ordered(column)) {
            return("ordinal")
        }

        if (
            !is.null(column) &&
            (is.numeric(column) || is.integer(column)) &&
            category_count > 6L
        ) {
            return("ordinal")
        }

        return("nominal")
    }

    if (!is.null(column) && is.ordered(column)) {
        return("ordinal")
    }

    if (!is.null(column) && (is.numeric(column) || is.integer(column))) {
        if (is.null(labels_attribute) || !length(labels_attribute)) {
            return("interval")
        }

        if (category_count > 6L) {
            return("interval")
        }
    }

    "nominal"
}


workspace_dataset_variable_type <- function(column) {
    if (is.null(column)) {
        return("unknown")
    }

    workspace_dataset_base_class(column)
}


workspace_dataset_variable_alignment <- function(column) {
    alignment <- workspace_dataset_attribute_text(
        workspace_dataset_attribute(column, "align")
    )

    if (!is.null(alignment) && is.element(
        alignment,
        c("left", "center", "right")
    )) {
        return(alignment)
    }

    if (
        !is.null(column) &&
        (is.numeric(column) || is.integer(column) || is.logical(column))
    ) {
        return("right")
    }

    "left"
}


workspace_dataset_finite_values <- function(column) {
    if (
        is.null(column) ||
        !(is.numeric(column) || is.integer(column) || is.logical(column))
    ) {
        return(numeric(0))
    }

    tryCatch(
        as.numeric(column[is.finite(column) & !is.na(column)]),
        error = function(error) numeric(0)
    )
}


workspace_dataset_calibration_flags <- function(column) {
    values <- workspace_dataset_finite_values(column)
    unit_interval <- length(values) > 0L &&
        all(values >= 0 & values <= 1)
    integer_values <- length(values) > 0L &&
        all(values >= 0) &&
        all(
            abs(values - round(values)) <
                .Machine$double.eps^0.5
        )
    binary <- FALSE
    multi_value <- FALSE

    if (isTRUE(integer_values)) {
        binary <- all(values == 0 | values == 1)
        minimum <- suppressWarnings(min(values))
        maximum <- suppressWarnings(max(values))

        if (
            is.finite(minimum) &&
            is.finite(maximum) &&
            !is.na(minimum) &&
            !is.na(maximum) &&
            identical(minimum, 0) &&
            maximum >= 2
        ) {
            multi_value <- length(unique(values)) == maximum + 1
        }
    }

    list(
        unit_interval = isTRUE(unit_interval),
        binary = isTRUE(binary),
        multi_value = isTRUE(multi_value),
        calibrated = isTRUE(unit_interval) || isTRUE(multi_value)
    )
}


workspace_dataset_category_state <- function(column, labels, na_values) {
    values <- character(0)
    category_labels <- character(0)
    summary <- ""

    if (!is.null(labels) && length(labels)) {
        label_names <- names(labels)
        values <- as.character(labels)
        category_labels <- if (!is.null(label_names) && length(label_names)) {
            as.character(label_names)
        }
        else {
            as.character(labels)
        }
        summary <- paste(
            utils::head(category_labels, 6L),
            collapse = ", "
        )
    }
    else if (!is.null(column) && is.factor(column)) {
        levels <- tryCatch(
            levels(column),
            error = function(error) character(0)
        )
        values <- as.character(levels)
        category_labels <- as.character(levels)
        summary <- paste(utils::head(category_labels, 6L), collapse = ", ")
    }

    if (!is.null(na_values) && length(na_values)) {
        missing_only <- setdiff(as.character(na_values), values)

        if (length(missing_only)) {
            values <- c(values, missing_only)
            category_labels <- c(
                category_labels,
                rep("", length(missing_only))
            )
        }
    }

    list(values = values, labels = category_labels, summary = summary)
}


workspace_dataset_category_is_missing <- function(
    value,
    na_values,
    na_range
) {
    if (
        !is.null(na_values) &&
        length(na_values) &&
        is.element(value, as.character(na_values))
    ) {
        return(TRUE)
    }

    if (is.null(na_range) || length(na_range) < 2L) {
        return(FALSE)
    }

    numeric_value <- suppressWarnings(as.numeric(value))
    range_minimum <- suppressWarnings(as.numeric(na_range[[1]]))
    range_maximum <- suppressWarnings(as.numeric(na_range[[2]]))

    if (!all(is.finite(c(
        numeric_value,
        range_minimum,
        range_maximum
    )))) {
        return(FALSE)
    }

    numeric_value >= min(range_minimum, range_maximum) &&
        numeric_value <= max(range_minimum, range_maximum)
}


workspace_dataset_categories_json <- function(
    categories,
    na_values,
    na_range
) {
    if (!length(categories$values)) {
        return("[]")
    }

    entries <- vapply(seq_along(categories$values), function(index) {
        value <- as.character(categories$values[[index]] %||% "")
        label <- as.character(categories$labels[[index]] %||% "")

        paste0(
            "{",
            "\"value\":", json_str(value), ",",
            "\"label\":", json_str(label), ",",
            "\"isMissing\":", json_bool(
                workspace_dataset_category_is_missing(
                    value,
                    na_values,
                    na_range
                )
            ),
            "}"
        )
    }, character(1))

    paste0("[", paste(entries, collapse = ","), "]")
}


workspace_dataset_missing_range_json <- function(na_range) {
    if (is.null(na_range) || length(na_range) < 2L) {
        return("null")
    }

    paste0(
        "{",
        "\"min\":", json_str(as.character(na_range[[1]])), ",",
        "\"max\":", json_str(as.character(na_range[[2]])),
        "}"
    )
}


workspace_dataset_variable_width <- function(column, declared_namespace) {
    width <- suppressWarnings(as.integer(
        workspace_dataset_attribute_text(
            workspace_dataset_attribute(column, "width")
        ) %||% NA_integer_
    ))

    if (is.finite(width) && !is.na(width) && width > 0L) {
        return(max(1L, min(60L, width)))
    }

    source <- workspace_dataset_undeclare_column(column, declared_namespace)
    sample <- tryCatch(
        utils::head(as.character(stats::na.omit(source)), 100L),
        error = function(error) character(0)
    )
    sample_width <- nchar(sample, type = "chars")
    sample_width <- sample_width[is.finite(sample_width)]
    width <- if (length(sample_width)) max(sample_width) else 1L

    if (!is.finite(width) || is.na(width)) {
        width <- 1L
    }

    max(1L, min(60L, suppressWarnings(as.integer(width))))
}


workspace_dataset_variable_decimals <- function(column, width) {
    decimals <- suppressWarnings(as.integer(
        workspace_dataset_attribute_text(
            workspace_dataset_attribute(column, "decimals")
        ) %||% NA_integer_
    ))

    if (is.finite(decimals) && !is.na(decimals)) {
        return(max(0L, min(8L, decimals)))
    }

    workspace_dataset_clamp_decimals(
        workspace_dataset_column_decimals(column),
        width
    )
}


workspace_dataset_is_declared <- function(column, declared_namespace) {
    if (is.null(declared_namespace)) {
        return(FALSE)
    }

    isTRUE(tryCatch(
        get("is.declared", envir = declared_namespace)(column),
        error = function(error) FALSE
    ))
}


workspace_dataset_variable_json <- function(name, column) {
    attributes <- workspace_dataset_declared_attributes(column)
    declared_namespace <- workspace_declared_namespace()
    categories <- workspace_dataset_category_state(
        column,
        attributes$labels,
        attributes$na_values
    )
    width <- workspace_dataset_variable_width(column, declared_namespace)
    calibration <- workspace_dataset_calibration_flags(column)
    label <- workspace_dataset_attribute_text(attributes$label) %||% ""
    measure <- workspace_dataset_measure(
        column,
        attributes$measurement,
        attributes$labels
    )
    flags <- workspace_dataset_item_flags(column)
    result_json <- paste0(
        "{",
        "\"name\":", json_str(as.character(name %||% "")), ",",
        "\"type\":", json_str(
            workspace_dataset_variable_type(column)
        ), ",",
        "\"label\":", json_str(label), ",",
        "\"values\":", json_str(categories$summary), ",",
        "\"width\":", json_num(width), ",",
        "\"decimals\":", json_num(
            workspace_dataset_variable_decimals(column, width)
        ), ",",
        "\"align\":", json_str(
            workspace_dataset_variable_alignment(column)
        ), ",",
        "\"measure\":", json_str(measure), ",",
        "\"calibrated\":", json_bool(calibration$calibrated), ",",
        "\"numeric\":", json_bool(flags$numeric), ",",
        "\"factor\":", json_bool(flags$factor), ",",
        "\"binary\":", json_bool(flags$binary), ",",
        "\"character\":", json_bool(flags$character), ",",
        "\"categorical\":", json_bool(flags$categorical), ",",
        "\"date\":", json_bool(flags$date), ",",
        "\"declared\":", json_bool(
            workspace_dataset_is_declared(column, declared_namespace)
        ), ",",
        "\"categories\":", workspace_dataset_categories_json(
            categories,
            attributes$na_values,
            attributes$na_range
        ), ",",
        "\"missingRange\":", workspace_dataset_missing_range_json(
            attributes$na_range
        ),
        "}"
    )

    result_json
}


workspace_dataset_item_flags <- function(column) {
    declared_namespace <- workspace_declared_namespace()
    source <- workspace_dataset_undeclare_column(column, declared_namespace)
    labels <- workspace_dataset_attribute(column, "labels")
    measure <- workspace_dataset_measure(
        column,
        workspace_dataset_attribute(column, "measurement"),
        labels
    )
    category_count <- workspace_dataset_category_count(column, labels)
    calibration <- workspace_dataset_calibration_flags(source)
    is_date <- inherits(source, "Date")
    is_character <- is.character(source)
    is_categorical <- is.factor(source) ||
        (!is.null(labels) && length(labels) > 0L)
    intrinsic_numeric <- !is_date &&
        (is.numeric(source) || is.integer(source) || is.logical(source))
    ordinal_numeric <- identical(measure, "ordinal") &&
        category_count >= 7L
    nominal_non_numeric <- identical(measure, "nominal") &&
        category_count > 0L
    is_numeric <- (
        isTRUE(intrinsic_numeric) &&
            !isTRUE(nominal_non_numeric)
    ) || isTRUE(ordinal_numeric)

    if (isTRUE(calibration$calibrated)) {
        is_numeric <- TRUE
    }

    list(
        numeric = isTRUE(is_numeric),
        factor = isTRUE(is_categorical),
        calibrated = isTRUE(calibration$calibrated),
        binary = isTRUE(calibration$binary),
        character = isTRUE(is_character),
        categorical = isTRUE(is_categorical),
        date = isTRUE(is_date)
    )
}
workspace_import_preview_result <- function(preview, row_limit) {
    preview <- tryCatch(
        as.data.frame(
            preview,
            stringsAsFactors = FALSE,
            check.names = FALSE
        ),
        error = function(error) error
    )

    if (inherits(preview, "error")) {
        return(list(
            ok = FALSE,
            error = as.character(conditionMessage(preview))
        ))
    }

    if (nrow(preview) > row_limit) {
        preview <- utils::head(preview, row_limit)
    }

    columns <- as.character(colnames(preview) %||% character(0))
    values <- lapply(columns, function(column_name) {
        tryCatch(
            as.character(preview[[column_name]]),
            error = function(error) character(0)
        )
    })
    values_json <- if (length(columns)) {
        paste0(
            "[",
            paste(vapply(values, json_strv, character(1)), collapse = ","),
            "]"
        )
    }
    else {
        "[]"
    }
    result_json <- paste0(
        "{",
        "\"colnames\":", json_strv(columns), ",",
        "\"vdata\":", values_json,
        "}"
    )

    list(
        ok = TRUE,
        result = list(
            colnames = columns,
            vdata = values,
            result_json = result_json
        ),
        result_json = result_json
    )
}


workspace_import_preview_error <- function(value) {
    if (!inherits(value, "error")) {
        return(NULL)
    }

    list(ok = FALSE, error = as.character(conditionMessage(value)))
}


workspace_import_binary_preview <- function(
    path,
    row_limit,
    file_encoding
) {
    if (!requireNamespace("DDIwR", quietly = TRUE)) {
        return(list(ok = FALSE, error = "missing-package: DDIwR"))
    }

    preview <- tryCatch(
        DDIwR::convert(
            from = path,
            to = NULL,
            declared = FALSE,
            encoding = if (nzchar(file_encoding)) file_encoding else NULL,
            n_max = row_limit
        ),
        error = function(error) error
    )
    error <- workspace_import_preview_error(preview)

    if (!is.null(error)) {
        return(error)
    }

    workspace_import_preview_result(preview, row_limit)
}


workspace_import_text_separator <- function(reader, separator) {
    if (identical(reader, "read.csv")) {
        return(",")
    }

    if (identical(reader, "read.delim")) {
        return("\t")
    }

    if (is.null(separator)) "" else separator
}


workspace_import_file_preview <- function(
    path,
    reader,
    nrows,
    binary,
    header,
    row_names,
    sep,
    quote,
    dec,
    na_strings,
    skip,
    strip_white,
    comment_char,
    file_encoding
) {
    path <- as.character(path %||% "")
    reader <- tolower(trimws(as.character(reader %||% "read.table")))
    row_limit <- suppressWarnings(as.integer(nrows %||% 8L))
    skip <- suppressWarnings(as.integer(skip %||% 0L))
    row_names <- suppressWarnings(as.integer(row_names %||% 0L))
    quote <- as.character(quote %||% "\"")
    decimal <- as.character(dec %||% ".")
    missing_values <- as.character(na_strings %||% "NA")
    comment <- as.character(comment_char %||% "#")
    file_encoding <- as.character(file_encoding %||% "")

    if (!nzchar(path)) {
        return(list(ok = FALSE, error = "missing-import-path"))
    }

    if (!file.exists(path)) {
        return(list(ok = FALSE, error = "import-file-not-found"))
    }

    if (!is.finite(row_limit) || is.na(row_limit) || row_limit < 1L) {
        row_limit <- 8L
    }

    if (!is.finite(skip) || is.na(skip) || skip < 0L) {
        skip <- 0L
    }

    if (!nzchar(quote)) quote <- "\""
    if (!nzchar(decimal)) decimal <- "."
    if (!nzchar(missing_values)) missing_values <- "NA"
    if (!nzchar(comment)) comment <- "#"

    if (isTRUE(binary) || identical(reader, "convert")) {
        return(workspace_import_binary_preview(
            path,
            row_limit,
            file_encoding
        ))
    }

    if (is.element(reader, c("readrds", "base::readrds"))) {
        preview <- tryCatch(
            base::readRDS(path),
            error = function(error) error
        )
        error <- workspace_import_preview_error(preview)

        if (!is.null(error)) {
            return(error)
        }

        return(workspace_import_preview_result(preview, row_limit))
    }

    arguments <- list(
        file = path,
        nrows = row_limit,
        header = isTRUE(header),
        row.names = if (row_names > 0L) row_names else NULL,
        stringsAsFactors = FALSE,
        check.names = FALSE,
        sep = workspace_import_text_separator(reader, sep),
        strip.white = isTRUE(strip_white),
        na.strings = missing_values,
        skip = skip,
        dec = decimal,
        fill = TRUE,
        comment.char = comment,
        quote = quote
    )
    preview <- tryCatch(
        do.call(utils::read.table, arguments),
        error = function(error) error
    )
    error <- workspace_import_preview_error(preview)

    if (!is.null(error)) {
        return(error)
    }

    workspace_import_preview_result(preview, row_limit)
}


workspace_dataset_numeric_values <- function(column) {
    text <- tryCatch(
        as.character(column),
        error = function(error) character(0)
    )
    present <- text[!is.na(text) & nzchar(trimws(text))]
    parsed <- suppressWarnings(as.numeric(present))
    is_numeric <- is.numeric(column) ||
        is.integer(column) ||
        inherits(column, "Date") ||
        (
            length(present) > 0L &&
            length(parsed) == length(present) &&
            all(is.finite(parsed))
        )

    list(
        numeric = isTRUE(is_numeric),
        values = if (isTRUE(is_numeric)) {
            suppressWarnings(as.numeric(as.character(column)))
        }
        else {
            rep_len(NA_real_, length(column))
        }
    )
}


workspace_dataset_numeric_values_json <- function(column, is_numeric) {
    if (!length(column)) {
        return("[]")
    }

    entries <- vapply(seq_along(column), function(index) {
        item <- tryCatch(
            column[[index]],
            error = function(error) column[index]
        )

        if (length(item) == 0L || all(is.na(item))) {
            return("null")
        }

        value <- suppressWarnings(as.numeric(as.character(item[[1]])))

        if (!isTRUE(is_numeric) || !is.finite(value) || is.na(value)) {
            return("null")
        }

        json_num(value)
    }, character(1))

    paste0("[", paste(entries, collapse = ","), "]")
}


workspace_dataset_values <- function(name, variable_name) {
    dataset <- workspace_editable_dataset(name)

    if (!isTRUE(dataset$ok)) {
        return(dataset)
    }

    variable_name <- as.character(variable_name %||% "")

    if (!nzchar(variable_name)) {
        return(list(
            ok = FALSE,
            error = "missing-workspace-variable-name"
        ))
    }

    column <- workspace_dataset_column(dataset, variable_name)

    if (!isTRUE(column$ok)) {
        return(list(
            ok = FALSE,
            error = "workspace-dataset-variable-not-found"
        ))
    }

    source <- workspace_dataset_undeclare_column(
        column$value,
        workspace_declared_namespace()
    )
    numeric_values <- workspace_dataset_numeric_values(source)
    row_names <- workspace_dataset_all_row_names(dataset$value)
    result_json <- paste0(
        "{",
        "\"name\":", json_str(dataset$name), ",",
        "\"variableName\":", json_str(variable_name), ",",
        "\"isNumeric\":", json_bool(numeric_values$numeric), ",",
        "\"values\":", workspace_dataset_numeric_values_json(
            source,
            numeric_values$numeric
        ), ",",
        "\"rowNames\":", json_strv(row_names),
        "}"
    )

    list(
        ok = TRUE,
        result = list(
            name = dataset$name,
            variableName = variable_name,
            isNumeric = numeric_values$numeric,
            values = numeric_values$values,
            rowNames = row_names,
            result_json = result_json
        ),
        result_json = result_json
    )
}
workspace_dataset_variables_json <- function(dataset, indices) {
    vapply(indices, function(index) {
        column_name <- as.character(
            dataset$columns[[index]] %||% paste0("V", index)
        )
        column <- tryCatch(
            dataset$value[[column_name]],
            error = function(error) NULL
        )

        workspace_dataset_variable_json(column_name, column)
    }, character(1))
}


workspace_dataset_variables <- function(name) {
    dataset <- workspace_editable_dataset(name)

    if (!isTRUE(dataset$ok)) {
        return(dataset)
    }

    indices <- seq_along(dataset$columns)
    variables_json <- workspace_dataset_variables_json(dataset, indices)

    list(
        ok = TRUE,
        result = list(
            name = dataset$name,
            variables = length(variables_json)
        ),
        result_json = paste0(
            "[",
            paste(variables_json, collapse = ","),
            "]"
        )
    )
}


workspace_dataset_variable_page <- function(start, count, total) {
    start <- suppressWarnings(as.integer(start %||% 1L))
    count <- suppressWarnings(as.integer(count %||% 20L))

    if (!is.finite(start) || is.na(start)) start <- 1L
    if (!is.finite(count) || is.na(count)) count <- 20L

    start <- max(1L, start)
    count <- max(1L, min(100L, count))
    last <- if (total > 0L) min(total, start + count - 1L) else 0L
    indices <- if (total > 0L && start <= total) {
        seq.int(start, last)
    }
    else {
        integer(0)
    }

    list(start = start, indices = indices)
}


workspace_dataset_variables_batch <- function(
    name,
    start = 1L,
    count = 20L
) {
    dataset <- workspace_editable_dataset(name)

    if (!isTRUE(dataset$ok)) {
        return(dataset)
    }

    total <- length(dataset$columns)
    page <- workspace_dataset_variable_page(start, count, total)
    items_json <- workspace_dataset_variables_json(
        dataset,
        page$indices
    )
    loaded <- length(items_json)
    result_json <- paste0(
        "{",
        "\"name\":", json_str(dataset$name), ",",
        "\"total\":", json_num(total), ",",
        "\"start\":", json_num(page$start), ",",
        "\"count\":", json_num(loaded), ",",
        "\"items\":[", paste(items_json, collapse = ","), "]",
        "}"
    )

    list(
        ok = TRUE,
        result = list(
            name = dataset$name,
            total = total,
            start = page$start,
            count = loaded
        ),
        result_json = result_json
    )
}
workspace_dataset_variable_request <- function(
    type,
    measure,
    label,
    width,
    decimals,
    align,
    categories,
    missing_range
) {
    list(
        has_type = !is.null(type),
        has_measure = !is.null(measure),
        has_label = !is.null(label),
        has_width = !is.null(width),
        has_decimals = !is.null(decimals),
        has_align = !is.null(align),
        has_categories = !is.null(categories),
        has_missing_range = !is.null(missing_range),
        type = trimws(as.character(type %||% "")),
        measure = trimws(as.character(measure %||% "")),
        label = as.character(label %||% ""),
        width = suppressWarnings(as.integer(width %||% NA_integer_)),
        decimals = suppressWarnings(as.integer(decimals %||% NA_integer_)),
        align = trimws(as.character(align %||% "")),
        categories = categories,
        missing_range = missing_range
    )
}


workspace_dataset_validate_variable_request <- function(request) {
    if (
        isTRUE(request$has_type) &&
        nzchar(request$type) &&
        !is.element(
            request$type,
            c("numeric", "integer", "character", "logical", "Date")
        )
    ) {
        return(list(
            ok = FALSE,
            error = "unsupported-dataset-variable-type"
        ))
    }

    if (
        isTRUE(request$has_align) &&
        nzchar(request$align) &&
        !is.element(request$align, c("left", "center", "right"))
    ) {
        return(list(
            ok = FALSE,
            error = "unsupported-dataset-variable-align"
        ))
    }

    list(ok = TRUE)
}


workspace_dataset_logical_vector <- function(values) {
    if (is.logical(values)) {
        return(values)
    }

    if (is.numeric(values) || is.integer(values)) {
        return(as.logical(values))
    }

    tokens <- trimws(tolower(as.character(values)))
    result <- rep(NA, length(tokens))
    true_values <- c("true", "t", "1", "yes", "y")
    false_values <- c("false", "f", "0", "no", "n")
    result[vapply(
        tokens,
        function(token) is.element(token, true_values),
        logical(1)
    )] <- TRUE
    result[vapply(
        tokens,
        function(token) is.element(token, false_values),
        logical(1)
    )] <- FALSE
    result[is.na(tokens)] <- NA
    result
}


workspace_dataset_coerce_variable <- function(values, type) {
    input <- if (is.factor(values)) as.character(values) else values
    output <- if (identical(type, "character")) {
        as.character(input)
    }
    else if (identical(type, "numeric")) {
        suppressWarnings(as.numeric(input))
    }
    else if (identical(type, "integer")) {
        if (inherits(input, "Date")) {
            suppressWarnings(as.integer(as.numeric(input)))
        }
        else {
            suppressWarnings(as.integer(input))
        }
    }
    else if (identical(type, "logical")) {
        workspace_dataset_logical_vector(input)
    }
    else if (identical(type, "Date")) {
        if (inherits(input, "Date")) {
            as.Date(input, origin = "1970-01-01")
        }
        else if (is.numeric(input) || is.integer(input)) {
            as.Date(input, origin = "1970-01-01")
        }
        else {
            suppressWarnings(as.Date(as.character(input)))
        }
    }
    else {
        values
    }

    invalid <- rep(FALSE, length(output))

    if (length(output) == length(input)) {
        if (
            inherits(input, "Date") ||
            is.numeric(input) ||
            is.integer(input) ||
            is.logical(input)
        ) {
            invalid <- !is.na(input) & is.na(output)
        }
        else {
            invalid <- !is.na(input) &
                nzchar(as.character(input)) &
                is.na(output)
        }
    }

    if (any(invalid)) {
        return(list(
            ok = FALSE,
            error = paste0(
                "dataset-variable-type-conversion-failed:",
                type
            )
        ))
    }

    list(ok = TRUE, value = output)
}


workspace_dataset_metadata_values <- function(values, template) {
    values <- as.character(values %||% character(0))

    if (!length(values)) {
        return(values)
    }

    if (inherits(template, "Date")) {
        return(suppressWarnings(as.Date(values)))
    }

    if (is.logical(template)) {
        return(as.logical(workspace_dataset_logical_vector(values)))
    }

    if (is.integer(template)) {
        return(suppressWarnings(as.integer(values)))
    }

    if (is.numeric(template)) {
        return(suppressWarnings(as.numeric(values)))
    }

    values
}


workspace_dataset_category_attributes <- function(categories, template) {
    entries <- if (is.list(categories)) categories else list()
    values <- vapply(entries, function(entry) {
        as.character((entry$value %||% "")[[1]] %||% "")
    }, character(1))
    labels <- vapply(entries, function(entry) {
        as.character((entry$label %||% "")[[1]] %||% "")
    }, character(1))
    missing <- vapply(
        entries,
        function(entry) isTRUE(entry$isMissing),
        logical(1)
    )
    keep <- nzchar(trimws(values))
    values <- values[keep]
    labels <- labels[keep]
    missing <- missing[keep]

    if (!length(values)) {
        return(list(labels = NULL, na_values = NULL))
    }

    label_values <- workspace_dataset_metadata_values(values, template)
    names(label_values) <- labels
    missing_values <- label_values[missing]

    if (!length(missing_values)) {
        missing_values <- NULL
    }

    list(labels = label_values, na_values = missing_values)
}


workspace_dataset_missing_range_attribute <- function(
    missing_range,
    template
) {
    minimum <- as.character(missing_range$min %||% "")
    maximum <- as.character(missing_range$max %||% "")

    if (!nzchar(trimws(minimum)) || !nzchar(trimws(maximum))) {
        return(NULL)
    }

    workspace_dataset_metadata_values(c(minimum, maximum), template)
}


workspace_dataset_target_measure <- function(request, attributes) {
    if (isTRUE(request$has_measure)) {
        return(request$measure)
    }

    workspace_dataset_attribute_text(attributes$measurement) %||% ""
}


workspace_dataset_target_label <- function(request, attributes) {
    if (isTRUE(request$has_label)) {
        if (nzchar(request$label)) request$label else NULL
    }
    else {
        workspace_dataset_attribute_text(attributes$label)
    }
}


workspace_dataset_target_decimals <- function(request, column) {
    if (isTRUE(request$has_decimals)) {
        if (is.finite(request$decimals) && !is.na(request$decimals)) {
            return(max(0L, min(8L, request$decimals)))
        }

        return(NULL)
    }

    workspace_dataset_attribute_text(
        workspace_dataset_attribute(column, "decimals")
    )
}


workspace_dataset_should_declare <- function(
    column,
    request,
    target_measure,
    attributes
) {
    inherits(column, "declared") ||
        nzchar(request$label) ||
        nzchar(target_measure) ||
        (
            isTRUE(request$has_categories) &&
            (!is.null(attributes$labels) || !is.null(attributes$na_values))
        ) ||
        (
            isTRUE(request$has_missing_range) &&
            !is.null(attributes$na_range)
        )
}


workspace_dataset_declare_variable <- function(
    values,
    column,
    request,
    attributes,
    declared_namespace
) {
    target_measure <- workspace_dataset_target_measure(request, attributes)

    if (nzchar(target_measure) && is.null(declared_namespace)) {
        return(list(
            ok = FALSE,
            error = "declared-package-not-available"
        ))
    }

    if (is.null(declared_namespace) || !workspace_dataset_should_declare(
        column,
        request,
        target_measure,
        attributes
    )) {
        return(list(ok = TRUE, value = values))
    }

    rebuilt <- tryCatch(
        get("declared", envir = declared_namespace)(
            values,
            labels = attributes$labels,
            na_values = attributes$na_values,
            na_range = attributes$na_range,
            label = workspace_dataset_target_label(request, attributes),
            measurement = if (nzchar(target_measure)) {
                target_measure
            }
            else {
                NULL
            },
            decimals = workspace_dataset_target_decimals(request, column)
        ),
        error = function(error) error
    )

    if (inherits(rebuilt, "error")) {
        return(list(
            ok = FALSE,
            error = as.character(conditionMessage(rebuilt))
        ))
    }

    list(ok = TRUE, value = rebuilt)
}


workspace_dataset_set_optional_attribute <- function(
    value,
    name,
    requested,
    requested_value,
    previous_value
) {
    if (isTRUE(requested)) {
        attr(value, name) <- requested_value
    }
    else if (!is.null(previous_value) && length(previous_value)) {
        attr(value, name) <- previous_value[[1]]
    }

    value
}


workspace_dataset_display_attributes <- function(
    value,
    column,
    request,
    attributes
) {
    label <- if (nzchar(request$label)) request$label else NULL
    value <- workspace_dataset_set_optional_attribute(
        value,
        "label",
        request$has_label,
        label,
        attributes$label
    )
    width <- if (
        is.finite(request$width) &&
        !is.na(request$width) &&
        request$width > 0L
    ) {
        max(1L, request$width)
    }
    else {
        NULL
    }
    value <- workspace_dataset_set_optional_attribute(
        value,
        "width",
        request$has_width,
        width,
        workspace_dataset_attribute(column, "width")
    )
    decimals <- if (
        is.finite(request$decimals) &&
        !is.na(request$decimals)
    ) {
        max(0L, min(8L, request$decimals))
    }
    else {
        NULL
    }
    value <- workspace_dataset_set_optional_attribute(
        value,
        "decimals",
        request$has_decimals,
        decimals,
        workspace_dataset_attribute(column, "decimals")
    )
    alignment <- if (nzchar(request$align)) request$align else NULL

    workspace_dataset_set_optional_attribute(
        value,
        "align",
        request$has_align,
        alignment,
        workspace_dataset_attribute(column, "align")
    )
}


workspace_dataset_update_variable <- function(
    name,
    variable_name,
    type = NULL,
    measure = NULL,
    label = NULL,
    width = NULL,
    decimals = NULL,
    align = NULL,
    categories = NULL,
    missing_range = NULL
) {
    dataset <- workspace_editable_dataset(name)

    if (!isTRUE(dataset$ok)) {
        return(dataset)
    }

    variable_name <- as.character(variable_name %||% "")

    if (!nzchar(variable_name)) {
        return(list(ok = FALSE, error = "missing-variable-name"))
    }

    if (!is.element(variable_name, dataset$columns)) {
        return(list(
            ok = FALSE,
            error = "workspace-dataset-variable-not-found"
        ))
    }

    request <- workspace_dataset_variable_request(
        type,
        measure,
        label,
        width,
        decimals,
        align,
        categories,
        missing_range
    )
    validation <- workspace_dataset_validate_variable_request(request)

    if (!isTRUE(validation$ok)) {
        return(validation)
    }

    column <- dataset$value[[variable_name]]
    declared_namespace <- workspace_declared_namespace()
    attributes <- workspace_dataset_declared_attributes(column)
    source <- workspace_dataset_undeclare_column(
        column,
        declared_namespace
    )
    updated <- source

    if (isTRUE(request$has_type) && nzchar(request$type)) {
        conversion <- workspace_dataset_coerce_variable(source, request$type)

        if (!isTRUE(conversion$ok)) {
            return(conversion)
        }

        updated <- conversion$value
    }

    if (isTRUE(request$has_categories)) {
        category_attributes <- workspace_dataset_category_attributes(
            request$categories,
            updated
        )
        attributes$labels <- category_attributes$labels
        attributes$na_values <- category_attributes$na_values
    }

    if (isTRUE(request$has_missing_range)) {
        attributes$na_range <- workspace_dataset_missing_range_attribute(
            request$missing_range,
            updated
        )
    }

    rebuilt <- workspace_dataset_declare_variable(
        updated,
        column,
        request,
        attributes,
        declared_namespace
    )

    if (!isTRUE(rebuilt$ok)) {
        return(rebuilt)
    }

    rebuilt$value <- workspace_dataset_display_attributes(
        rebuilt$value,
        column,
        request,
        attributes
    )
    dataset$value[[variable_name]] <- rebuilt$value
    workspace_dataset_assign(dataset, dataset$value)

    list(
        ok = TRUE,
        result = list(name = variable_name),
        result_json = workspace_dataset_variable_json(
            variable_name,
            rebuilt$value
        )
    )
}

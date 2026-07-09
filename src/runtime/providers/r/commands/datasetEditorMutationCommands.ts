interface RDatasetCategoryState {
    value: string;
    label: string;
    isMissing: boolean;
}

interface RDatasetMissingRange {
    min?: unknown;
    max?: unknown;
}


const rJsonLiteral = function(value: unknown): string {
    return JSON.stringify(String(value ?? ""));
};

const cleanCategoryStates = function(categories: unknown): RDatasetCategoryState[] {
    if (!Array.isArray(categories)) {
        return [];
    }

    return categories.map((entry) => {
        return {
            value: String(entry?.value || "").trim(),
            label: String(entry?.label || "").trim(),
            isMissing: Boolean(entry?.isMissing)
        };
    }).filter((entry) => entry.value);
};

const buildRCharacterVector = function(values: string[]): string {
    return values.map((value) => JSON.stringify(value)).join(", ");
};

const buildRLogicalVector = function(values: boolean[]): string {
    return values.map((value) => value ? "TRUE" : "FALSE").join(", ");
};

const buildOptionalRangeValue = function(value: unknown): string {
    return value ? JSON.stringify(String(value)) : "NULL";
};

export const createRDatasetCellValueCommand = function(
    datasetName: unknown,
    rowIndex: unknown,
    columnName: unknown,
    value: unknown
): string {
    return [
        "local({",
        `  .name <- ${rJsonLiteral(datasetName)}`,
        `  .row <- ${JSON.stringify(Number(rowIndex) || 0)}`,
        `  .column <- ${rJsonLiteral(columnName)}`,
        `  .value <- ${rJsonLiteral(value)}`,
        "  .df <- get(.name, envir = .GlobalEnv)",
        "  if (!is.data.frame(.df) || .row < 1L || !is.element(.column, colnames(.df))) stop(\"invalid-cell-target\")",
        "  .old <- .df[[.column]]",
        "  .next <- .value",
        "  if (is.factor(.old)) {",
        "    if (!is.element(.next, levels(.old))) levels(.old) <- c(levels(.old), .next)",
        "    .old[.row] <- .next",
        "    .df[[.column]] <- .old",
        "  } else if (is.integer(.old)) {",
        "    .df[[.column]][.row] <- suppressWarnings(as.integer(.next))",
        "  } else if (is.numeric(.old)) {",
        "    .df[[.column]][.row] <- suppressWarnings(as.numeric(.next))",
        "  } else if (is.logical(.old)) {",
        "    .df[[.column]][.row] <- as.logical(.next)",
        "  } else {",
        "    .df[[.column]][.row] <- .next",
        "  }",
        "  assign(.name, .df, envir = .GlobalEnv)",
        "})"
    ].join("\n");
};

export const createRDatasetVariableNameCommand = function(
    datasetName: unknown,
    columnIndex: unknown,
    value: unknown
): string {
    return [
        "local({",
        `  .name <- ${rJsonLiteral(datasetName)}`,
        `  .column <- ${JSON.stringify(Number(columnIndex) || 0)}`,
        `  .value <- ${rJsonLiteral(value)}`,
        "  .df <- get(.name, envir = .GlobalEnv)",
        "  if (!is.data.frame(.df) || .column < 1L || .column > ncol(.df) || !nzchar(.value)) stop(\"invalid-variable-name\")",
        "  colnames(.df)[.column] <- make.names(.value, unique = TRUE)",
        "  assign(.name, .df, envir = .GlobalEnv)",
        "})"
    ].join("\n");
};

export const createRDatasetVariableAttributeCommand = function(
    datasetName: unknown,
    columnIndex: unknown,
    attributeName: unknown,
    value: unknown
): string {
    return [
        "local({",
        `  .name <- ${rJsonLiteral(datasetName)}`,
        `  .column <- ${JSON.stringify(Number(columnIndex) || 0)}`,
        `  .attribute <- ${rJsonLiteral(attributeName)}`,
        `  .value <- ${rJsonLiteral(value)}`,
        "  .df <- get(.name, envir = .GlobalEnv)",
        "  if (!is.data.frame(.df) || .column < 1L || .column > ncol(.df)) stop(\"invalid-variable-target\")",
        "  if (!is.element(.attribute, c(\"type\", \"label\", \"measure\", \"align\", \"width\", \"decimals\"))) stop(\"invalid-variable-attribute\")",
        "  if (.attribute == \"type\") {",
        "    .source <- if (is.factor(.df[[.column]])) as.character(.df[[.column]]) else .df[[.column]]",
        "    if (identical(.value, \"character\")) .df[[.column]] <- as.character(.source)",
        "    else if (identical(.value, \"numeric\")) .df[[.column]] <- suppressWarnings(as.numeric(.source))",
        "    else if (identical(.value, \"integer\")) .df[[.column]] <- suppressWarnings(as.integer(.source))",
        "    else if (identical(.value, \"logical\")) .df[[.column]] <- suppressWarnings(as.logical(.source))",
        "    else if (identical(.value, \"Date\")) .df[[.column]] <- suppressWarnings(as.Date(as.character(.source)))",
        "    else stop(\"unsupported-variable-type\")",
        "  } else if (.attribute == \"measure\") {",
        "    attr(.df[[.column]], \"measurement\") <- if (nzchar(.value)) .value else NULL",
        "    attr(.df[[.column]], \"measure\") <- if (nzchar(.value)) .value else NULL",
        "  } else if (.attribute == \"width\" || .attribute == \"decimals\") {",
        "    attr(.df[[.column]], .attribute) <- suppressWarnings(as.integer(.value))",
        "  } else {",
        "    attr(.df[[.column]], .attribute) <- if (nzchar(.value)) .value else NULL",
        "  }",
        "  assign(.name, .df, envir = .GlobalEnv)",
        "})"
    ].join("\n");
};

export const createRDatasetValueLabelsCommand = function(
    datasetName: unknown,
    columnIndex: unknown,
    categories: unknown,
    missingRange: RDatasetMissingRange | null | undefined
): string {
    const cleanCategories = cleanCategoryStates(categories);
    const categoryValues = buildRCharacterVector(cleanCategories.map((entry) => entry.value));
    const categoryLabels = buildRCharacterVector(cleanCategories.map((entry) => {
        return entry.label || entry.value;
    }));
    const categoryMissing = buildRLogicalVector(cleanCategories.map((entry) => entry.isMissing));
    const rangeMinimum = buildOptionalRangeValue(missingRange?.min);
    const rangeMaximum = buildOptionalRangeValue(missingRange?.max);

    return [
        "local({",
        `  .name <- ${rJsonLiteral(datasetName)}`,
        `  .column <- ${JSON.stringify(Number(columnIndex) || 0)}`,
        `  .category_values <- c(${categoryValues})`,
        `  .category_labels <- c(${categoryLabels})`,
        `  .category_missing <- c(${categoryMissing})`,
        `  .range_min <- ${rangeMinimum}`,
        `  .range_max <- ${rangeMaximum}`,
        "  .coerce_like <- function(values, template) {",
        "    if (is.factor(template)) return(as.character(values))",
        "    if (is.integer(template)) return(suppressWarnings(as.integer(values)))",
        "    if (is.numeric(template)) return(suppressWarnings(as.numeric(values)))",
        "    if (is.logical(template)) return(as.logical(values))",
        "    as.character(values)",
        "  }",
        "  .df <- get(.name, envir = .GlobalEnv)",
        "  if (!is.data.frame(.df) || .column < 1L || .column > ncol(.df)) stop(\"invalid-variable-target\")",
        "  .source <- .df[[.column]]",
        "  if (length(.category_values) && any(!nzchar(.category_values))) stop(\"invalid-value-labels\")",
        "  .label_values <- if (length(.category_values)) .coerce_like(.category_values, .source) else NULL",
        "  if (!is.null(.label_values)) names(.label_values) <- .category_labels",
        "  .missing_values <- if (!is.null(.label_values)) .label_values[seq_along(.label_values) <= length(.category_missing) & .category_missing] else NULL",
        "  if (!length(.missing_values)) .missing_values <- NULL",
        "  .missing_range <- NULL",
        "  if (!is.null(.range_min) && !is.null(.range_max) && nzchar(.range_min) && nzchar(.range_max)) {",
        "    .missing_range <- .coerce_like(c(.range_min, .range_max), .source)",
        "  }",
        "  .label <- attr(.source, \"label\", exact = TRUE)",
        "  .measure <- attr(.source, \"measurement\", exact = TRUE)",
        "  if (is.null(.measure)) .measure <- attr(.source, \"measure\", exact = TRUE)",
        "  .rebuilt <- .source",
        "  if (requireNamespace(\"declared\", quietly = TRUE)) {",
        "    if (!is.null(.label_values) || !is.null(.missing_values) || !is.null(.missing_range) || inherits(.source, \"declared\")) {",
        "      .rebuilt <- declared::declared(.source, labels = .label_values, na_values = .missing_values, na_range = .missing_range, label = .label, measurement = .measure)",
        "    }",
        "  } else {",
        "    attr(.rebuilt, \"labels\") <- .label_values",
        "    attr(.rebuilt, \"na_values\") <- .missing_values",
        "    attr(.rebuilt, \"na_range\") <- .missing_range",
        "  }",
        "  attr(.rebuilt, \"labels\") <- .label_values",
        "  attr(.rebuilt, \"na_values\") <- .missing_values",
        "  attr(.rebuilt, \"na_range\") <- .missing_range",
        "  attr(.rebuilt, \"label\") <- .label",
        "  if (!is.null(.measure)) attr(.rebuilt, \"measurement\") <- .measure",
        "  .df[[.column]] <- .rebuilt",
        "  assign(.name, .df, envir = .GlobalEnv)",
        "})"
    ].join("\n");
};

export const createRDatasetRowNameCommand = function(
    datasetName: unknown,
    row: unknown,
    nextName: unknown
): string {
    return [
        "local({",
        `  .name <- ${rJsonLiteral(datasetName)}`,
        `  .row <- ${JSON.stringify(Number(row) || 0)}`,
        `  .next <- ${rJsonLiteral(nextName)}`,
        "  .df <- get(.name, envir = .GlobalEnv)",
        "  if (!is.data.frame(.df) || .row < 1L || .row > nrow(.df)) stop(\"invalid-row-target\")",
        "  rownames(.df)[.row] <- .next",
        "  assign(.name, .df, envir = .GlobalEnv)",
        "})"
    ].join("\n");
};

export const createRDatasetRowInsertCommand = function(
    datasetName: unknown,
    row: unknown,
    nextName: unknown,
    position: unknown
): string {
    return [
        "local({",
        `  .name <- ${rJsonLiteral(datasetName)}`,
        `  .row <- ${JSON.stringify(Number(row) || 0)}`,
        `  .next <- ${rJsonLiteral(nextName)}`,
        `  .position <- ${rJsonLiteral(position)}`,
        "  .df <- get(.name, envir = .GlobalEnv)",
        "  if (!is.data.frame(.df) || .row < 1L || .row > nrow(.df)) stop(\"invalid-row-target\")",
        "  .insert <- if (identical(.position, \"before\")) .row else .row + 1L",
        "  .names <- rownames(.df)",
        "  if (is.null(.names) || length(.names) != nrow(.df)) .names <- as.character(seq_len(nrow(.df)))",
        "  .new <- .df[NA_integer_, , drop = FALSE]",
        "  rownames(.new) <- NULL",
        "  .before <- if (.insert <= 1L) .df[0, , drop = FALSE] else .df[seq_len(.insert - 1L), , drop = FALSE]",
        "  .after <- if (.insert > nrow(.df)) .df[0, , drop = FALSE] else .df[seq(.insert, nrow(.df)), , drop = FALSE]",
        "  .df <- rbind(.before, .new, .after)",
        "  rownames(.df) <- append(.names, make.unique(c(.names, .next), sep = \"_\")[[length(.names) + 1L]], after = .insert - 1L)",
        "  assign(.name, .df, envir = .GlobalEnv)",
        "})"
    ].join("\n");
};

export const createRDatasetRowRemoveCommand = function(
    datasetName: unknown,
    row: unknown
): string {
    return [
        "local({",
        `  .name <- ${rJsonLiteral(datasetName)}`,
        `  .row <- ${JSON.stringify(Number(row) || 0)}`,
        "  .df <- get(.name, envir = .GlobalEnv)",
        "  if (!is.data.frame(.df) || .row < 1L || .row > nrow(.df)) stop(\"invalid-row-target\")",
        "  .df <- .df[-.row, , drop = FALSE]",
        "  rownames(.df) <- NULL",
        "  assign(.name, .df, envir = .GlobalEnv)",
        "})"
    ].join("\n");
};

export const createRDatasetColumnInsertCommand = function(
    datasetName: unknown,
    columnName: unknown,
    nextName: unknown,
    position: unknown
): string {
    return [
        "local({",
        `  .name <- ${rJsonLiteral(datasetName)}`,
        `  .reference <- ${rJsonLiteral(columnName)}`,
        `  .new <- ${rJsonLiteral(nextName)}`,
        `  .position <- ${rJsonLiteral(position)}`,
        "  .df <- get(.name, envir = .GlobalEnv)",
        "  if (!is.data.frame(.df) || !is.element(.reference, names(.df))) stop(\"invalid-column-target\")",
        "  .cols <- names(.df)",
        "  .ref <- match(.reference, .cols)",
        "  .after <- if (identical(.position, \"before\")) .ref - 1L else .ref",
        "  .new_name <- make.names(.new, unique = TRUE)",
        "  .df[[.new_name]] <- NA",
        "  .df <- .df[, append(.cols, .new_name, after = .after), drop = FALSE]",
        "  assign(.name, .df, envir = .GlobalEnv)",
        "  .new_name",
        "})"
    ].join("\n");
};

export const createRDatasetColumnRemoveCommand = function(
    datasetName: unknown,
    columnName: unknown
): string {
    return [
        "local({",
        `  .name <- ${rJsonLiteral(datasetName)}`,
        `  .column <- ${rJsonLiteral(columnName)}`,
        "  .df <- get(.name, envir = .GlobalEnv)",
        "  if (!is.data.frame(.df) || !is.element(.column, names(.df))) stop(\"invalid-column-target\")",
        "  .df[[.column]] <- NULL",
        "  assign(.name, .df, envir = .GlobalEnv)",
        "})"
    ].join("\n");
};

export const createRDatasetRowSortCommand = function(
    datasetName: unknown,
    columnName: unknown,
    decreasing: boolean
): string {
    return [
        "local({",
        `  .name <- ${rJsonLiteral(datasetName)}`,
        `  .column <- ${rJsonLiteral(columnName)}`,
        `  .decreasing <- ${decreasing ? "TRUE" : "FALSE"}`,
        "  .df <- get(.name, envir = .GlobalEnv)",
        "  if (!is.data.frame(.df) || !is.element(.column, names(.df))) stop(\"invalid-column-target\")",
        "  .df <- .df[order(.df[[.column]], decreasing = .decreasing, na.last = TRUE), , drop = FALSE]",
        "  rownames(.df) <- NULL",
        "  assign(.name, .df, envir = .GlobalEnv)",
        "})"
    ].join("\n");
};

export const createRDatasetVariableValuesCommand = function(
    datasetName: unknown,
    variableName: unknown
): string {
    return [
        "local({",
        `  .name <- ${rJsonLiteral(datasetName)}`,
        `  .variable <- ${rJsonLiteral(variableName)}`,
        "  if (!exists(.name, envir = .GlobalEnv, inherits = FALSE)) return(\"\")",
        "  .df <- get(.name, envir = .GlobalEnv)",
        "  if (!is.data.frame(.df) || !is.element(.variable, colnames(.df))) return(\"\")",
        "  paste(unique(as.character(.df[[.variable]])), collapse = \"\\n\")",
        "})"
    ].join("\n");
};

import type {
    CellUpdateRequest,
    ColumnInsertRequest,
    ColumnRemoveRequest,
    ColumnRenameRequest,
    DeclaredMissingUpdateRequest,
    RowInsertRequest,
    RowNameUpdateRequest,
    RowRemoveRequest,
    RowSortRequest,
    ValueLabelUpdateRequest,
    VariableMetadataUpdateRequest
} from "../../../provider-contract/runtimeProvider";
import {
    asRStringLiteral,
    asRValueLiteral
} from "./rLiteral";


export const createVisibleCellUpdateCommand = function(
    request: CellUpdateRequest
): string {
    return [
        "local({",
        `    .name <- ${asRStringLiteral(request.objectName)}`,
        `    .row <- ${request.rowIndex + 1}`,
        `    .column <- ${asRStringLiteral(request.columnName)}`,
        `    .value <- ${asRValueLiteral(request.value)}`,
        "    if (!exists(.name, envir = .GlobalEnv, inherits = FALSE)) stop(\"Dataset not found: \", .name)",
        "    .data <- get(.name, envir = .GlobalEnv)",
        "    if (!is.element(.column, names(.data))) stop(\"Column not found: \", .column)",
        "    .data[.row, .column] <- .value",
        "    assign(.name, .data, envir = .GlobalEnv)",
        "    invisible(.data)",
        "})"
    ].join("\n");
};


export const createVisibleColumnRenameCommand = function(
    request: ColumnRenameRequest
): string {
    return [
        "local({",
        `    .name <- ${asRStringLiteral(request.objectName)}`,
        `    .column <- ${asRStringLiteral(request.fromName)}`,
        `    .next <- ${asRStringLiteral(request.toName)}`,
        "    if (!exists(.name, envir = .GlobalEnv, inherits = FALSE)) stop(\"Dataset not found: \", .name)",
        "    .data <- get(.name, envir = .GlobalEnv)",
        "    if (!is.element(.column, names(.data))) stop(\"Column not found: \", .column)",
        "    names(.data)[names(.data) == .column] <- .next",
        "    assign(.name, .data, envir = .GlobalEnv)",
        "    invisible(.data)",
        "})"
    ].join("\n");
};


export const createVisibleColumnInsertCommand = function(
    request: ColumnInsertRequest
): string {
    return [
        "local({",
        `    .name <- ${asRStringLiteral(request.objectName)}`,
        `    .reference <- ${asRStringLiteral(request.referenceName)}`,
        `    .new <- ${asRStringLiteral(request.newName)}`,
        `    .position <- ${asRStringLiteral(request.position)}`,
        "    if (!exists(.name, envir = .GlobalEnv, inherits = FALSE)) stop(\"Dataset not found: \", .name)",
        "    .data <- get(.name, envir = .GlobalEnv)",
        "    .cols <- names(.data)",
        "    if (!is.element(.reference, .cols)) stop(\"Column not found: \", .reference)",
        "    .ref <- match(.reference, .cols)",
        "    .after <- if (identical(.position, \"before\")) .ref - 1L else .ref",
        "    .data[[.new]] <- NA",
        "    .data <- .data[, append(.cols, .new, after = .after), drop = FALSE]",
        "    assign(.name, .data, envir = .GlobalEnv)",
        "    invisible(.data)",
        "})"
    ].join("\n");
};


export const createVisibleColumnRemoveCommand = function(
    request: ColumnRemoveRequest
): string {
    return [
        "local({",
        `    .name <- ${asRStringLiteral(request.objectName)}`,
        `    .column <- ${asRStringLiteral(request.columnName)}`,
        "    if (!exists(.name, envir = .GlobalEnv, inherits = FALSE)) stop(\"Dataset not found: \", .name)",
        "    .data <- get(.name, envir = .GlobalEnv)",
        "    if (!is.element(.column, names(.data))) stop(\"Column not found: \", .column)",
        "    .data[[.column]] <- NULL",
        "    assign(.name, .data, envir = .GlobalEnv)",
        "    invisible(.data)",
        "})"
    ].join("\n");
};


export const createVisibleRowInsertCommand = function(
    request: RowInsertRequest
): string {
    return [
        "local({",
        `    .name <- ${asRStringLiteral(request.objectName)}`,
        `    .row <- ${request.rowIndex + 1}`,
        `    .next <- ${asRStringLiteral(request.name)}`,
        `    .position <- ${asRStringLiteral(request.position)}`,
        "    if (!exists(.name, envir = .GlobalEnv, inherits = FALSE)) stop(\"Dataset not found: \", .name)",
        "    .data <- get(.name, envir = .GlobalEnv)",
        "    .insert <- if (identical(.position, \"before\")) .row else .row + 1L",
        "    .names <- rownames(.data)",
        "    if (is.null(.names) || length(.names) != nrow(.data)) .names <- as.character(seq_len(nrow(.data)))",
        "    if (!nzchar(.next)) .next <- as.character(.insert)",
        "    .next <- make.unique(c(.names, .next), sep = \"_\")[[length(.names) + 1L]]",
        "    .new <- .data[NA_integer_, , drop = FALSE]",
        "    rownames(.new) <- NULL",
        "    .before <- if (.insert <= 1L) .data[0, , drop = FALSE] else .data[seq_len(.insert - 1L), , drop = FALSE]",
        "    .after <- if (.insert > nrow(.data)) .data[0, , drop = FALSE] else .data[seq(.insert, nrow(.data)), , drop = FALSE]",
        "    .data <- rbind(.before, .new, .after)",
        "    rownames(.data) <- append(.names, .next, after = .insert - 1L)",
        "    assign(.name, .data, envir = .GlobalEnv)",
        "    invisible(.data)",
        "})"
    ].join("\n");
};


export const createVisibleRowRemoveCommand = function(
    request: RowRemoveRequest
): string {
    return [
        "local({",
        `    .name <- ${asRStringLiteral(request.objectName)}`,
        `    .row <- ${request.rowIndex + 1}`,
        "    if (!exists(.name, envir = .GlobalEnv, inherits = FALSE)) stop(\"Dataset not found: \", .name)",
        "    .data <- get(.name, envir = .GlobalEnv)",
        "    .data <- .data[-.row, , drop = FALSE]",
        "    rownames(.data) <- NULL",
        "    assign(.name, .data, envir = .GlobalEnv)",
        "    invisible(.data)",
        "})"
    ].join("\n");
};


export const createVisibleRowNameUpdateCommand = function(
    request: RowNameUpdateRequest
): string {
    return [
        "local({",
        `    .name <- ${asRStringLiteral(request.objectName)}`,
        `    .row <- ${request.rowIndex + 1}`,
        `    .next <- ${asRStringLiteral(request.name)}`,
        "    if (!exists(.name, envir = .GlobalEnv, inherits = FALSE)) stop(\"Dataset not found: \", .name)",
        "    .data <- get(.name, envir = .GlobalEnv)",
        "    rownames(.data)[.row] <- .next",
        "    assign(.name, .data, envir = .GlobalEnv)",
        "    invisible(.data)",
        "})"
    ].join("\n");
};


export const createVisibleRowSortCommand = function(
    request: RowSortRequest
): string {
    return [
        "local({",
        `    .name <- ${asRStringLiteral(request.objectName)}`,
        `    .column <- ${asRStringLiteral(request.columnName)}`,
        `    .decreasing <- ${request.direction === "descending" ? "TRUE" : "FALSE"}`,
        "    if (!exists(.name, envir = .GlobalEnv, inherits = FALSE)) stop(\"Dataset not found: \", .name)",
        "    .data <- get(.name, envir = .GlobalEnv)",
        "    if (!is.element(.column, names(.data))) stop(\"Column not found: \", .column)",
        "    .data <- .data[order(.data[[.column]], decreasing = .decreasing, na.last = TRUE), , drop = FALSE]",
        "    rownames(.data) <- NULL",
        "    assign(.name, .data, envir = .GlobalEnv)",
        "    invisible(.data)",
        "})"
    ].join("\n");
};


const createNamedRVectorLiteral = function(
    entries: Array<{
        value: unknown;
        label: string;
    }>
): string[] {
    const values = entries.map((entry) => {
        return asRValueLiteral(entry.value);
    });
    const labels = entries.map((entry) => {
        return asRStringLiteral(entry.label || String(entry.value ?? ""));
    });

    return [
        "c(" + values.join(", ") + ")",
        "c(" + labels.join(", ") + ")"
    ];
};


export const createVisibleValueLabelUpdateCommand = function(
    request: ValueLabelUpdateRequest
): string {
    const [values, labels] = createNamedRVectorLiteral(request.labels);

    return [
        "local({",
        `    .name <- ${asRStringLiteral(request.objectName)}`,
        `    .variable <- ${asRStringLiteral(request.variableName)}`,
        `    .values <- ${values}`,
        `    .labels <- ${labels}`,
        "    if (!exists(.name, envir = .GlobalEnv, inherits = FALSE)) stop(\"Dataset not found: \", .name)",
        "    .data <- get(.name, envir = .GlobalEnv)",
        "    if (!is.data.frame(.data)) stop(\"Object is not a dataset: \", .name)",
        "    if (!is.element(.variable, names(.data))) stop(\"Variable not found: \", .variable)",
        "    names(.values) <- .labels",
        "    attr(.data[[.variable]], \"labels\") <- .values",
        "    assign(.name, .data, envir = .GlobalEnv)",
        "    invisible(.data)",
        "})"
    ].join("\n");
};


export const createVisibleDeclaredMissingUpdateCommand = function(
    request: DeclaredMissingUpdateRequest
): string {
    const [values, labels] = createNamedRVectorLiteral(request.values);

    return [
        "local({",
        `    .name <- ${asRStringLiteral(request.objectName)}`,
        `    .variable <- ${asRStringLiteral(request.variableName)}`,
        `    .values <- ${values}`,
        `    .labels <- ${labels}`,
        "    if (!exists(.name, envir = .GlobalEnv, inherits = FALSE)) stop(\"Dataset not found: \", .name)",
        "    .data <- get(.name, envir = .GlobalEnv)",
        "    if (!is.data.frame(.data)) stop(\"Object is not a dataset: \", .name)",
        "    if (!is.element(.variable, names(.data))) stop(\"Variable not found: \", .variable)",
        "    names(.values) <- .labels",
        "    .current <- attr(.data[[.variable]], \"labels\", exact = TRUE)",
        "    if (is.null(.current)) .current <- .values[0]",
        "    .current <- .current[!is.element(as.character(.current), as.character(.values))]",
        "    attr(.data[[.variable]], \"labels\") <- c(.current, .values)",
        "    attr(.data[[.variable]], \"na_values\") <- .values",
        "    assign(.name, .data, envir = .GlobalEnv)",
        "    invisible(.data)",
        "})"
    ].join("\n");
};


export const createVisibleVariableMetadataUpdateCommand = function(
    request: VariableMetadataUpdateRequest
): string {
    return [
        "local({",
        `    .name <- ${asRStringLiteral(request.objectName)}`,
        `    .variable <- ${asRStringLiteral(request.variableName)}`,
        `    .key <- ${asRStringLiteral(request.metadataKey)}`,
        `    .value <- ${asRStringLiteral(request.value)}`,
        "    if (!exists(.name, envir = .GlobalEnv, inherits = FALSE)) stop(\"Dataset not found: \", .name)",
        "    .data <- get(.name, envir = .GlobalEnv)",
        "    if (!is.data.frame(.data)) stop(\"Object is not a dataset: \", .name)",
        "    if (!is.element(.variable, names(.data))) stop(\"Variable not found: \", .variable)",
        "    .column <- .data[[.variable]]",
        "    if (identical(.key, \"name\")) {",
        "        if (!nzchar(trimws(.value))) stop(\"Variable name is required\")",
        "        names(.data)[names(.data) == .variable] <- .value",
        "        assign(.name, .data, envir = .GlobalEnv)",
        "        invisible(.data)",
        "    } else {",
        "        if (identical(.key, \"type\")) {",
        "            .source <- if (is.factor(.column)) as.character(.column) else .column",
        "            if (identical(.value, \"character\")) .column <- as.character(.source)",
        "            else if (identical(.value, \"numeric\")) .column <- suppressWarnings(as.numeric(.source))",
        "            else if (identical(.value, \"integer\")) .column <- suppressWarnings(as.integer(.source))",
        "            else if (identical(.value, \"logical\")) .column <- suppressWarnings(as.logical(.source))",
        "            else if (identical(.value, \"Date\")) .column <- suppressWarnings(as.Date(as.character(.source)))",
        "            else stop(\"Unsupported variable type: \", .value)",
        "        } else if (identical(.key, \"label\")) {",
        "            attr(.column, \"label\") <- if (nzchar(.value)) .value else NULL",
        "        } else if (identical(.key, \"width\")) {",
        "            .width <- suppressWarnings(as.integer(.value))",
        "            attr(.column, \"width\") <- if (is.finite(.width) && !is.na(.width) && .width > 0L) .width else NULL",
        "        } else if (identical(.key, \"decimals\")) {",
        "            .decimals <- suppressWarnings(as.integer(.value))",
        "            attr(.column, \"decimals\") <- if (is.finite(.decimals) && !is.na(.decimals)) max(0L, min(8L, .decimals)) else NULL",
        "        } else if (identical(.key, \"align\")) {",
        "            if (nzchar(.value) && !is.element(.value, c(\"left\", \"center\", \"right\"))) stop(\"Unsupported alignment: \", .value)",
        "            attr(.column, \"align\") <- if (nzchar(.value)) .value else NULL",
        "        } else if (identical(.key, \"measure\")) {",
        "            attr(.column, \"measurement\") <- if (nzchar(.value)) .value else NULL",
        "        } else if (identical(.key, \"role\")) {",
        "            attr(.column, \"role\") <- if (nzchar(.value)) .value else NULL",
        "        } else if (identical(.key, \"values\")) {",
        "            .parts <- unlist(strsplit(.value, \"[;\\r\\n]+\"))",
        "            .parts <- trimws(.parts[nzchar(trimws(.parts))])",
        "            .labels <- lapply(.parts, function(.part) {",
        "                .separator <- regexpr(\"=\", .part, fixed = TRUE)",
        "                if (.separator < 1L) return(NULL)",
        "                .label <- trimws(substr(.part, .separator + 1L, nchar(.part)))",
        "                .raw <- trimws(substr(.part, 1L, .separator - 1L))",
        "                .coerced <- if (is.numeric(.column) || is.integer(.column)) suppressWarnings(as.numeric(.raw)) else .raw",
        "                structure(.coerced, names = .label)",
        "            })",
        "            .labels <- .labels[!vapply(.labels, is.null, logical(1))]",
        "            attr(.column, \"labels\") <- if (length(.labels)) do.call(c, .labels) else NULL",
        "        } else {",
        "            stop(\"Unsupported metadata key: \", .key)",
        "        }",
        "        .data[[.variable]] <- .column",
        "        assign(.name, .data, envir = .GlobalEnv)",
        "        invisible(.data)",
        "    }",
        "})"
    ].join("\n");
};

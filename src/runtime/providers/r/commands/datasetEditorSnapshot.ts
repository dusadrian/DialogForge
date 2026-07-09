export interface RDatasetSnapshotCategoryState {
    value: string;
    label: string;
    isMissing: boolean;
}

export interface RDatasetSnapshotMissingRange {
    min: string;
    max: string;
}

export interface RDatasetEditorSnapshot {
    name: string;
    rowCount: number;
    columnCount: number;
    rowStart: number;
    columnStart: number;
    allColumns: string[];
    columns: string[];
    rows: Array<{
        index: number;
        name: string;
        values: Array<{
            display: string;
            declaredMissing: boolean;
        }>;
    }>;
    variables: Array<{
        index: number;
        name: string;
        type: string;
        width: number;
        decimals: number;
        label: string;
        values: string;
        align: string;
        measure: string;
        categories: RDatasetSnapshotCategoryState[];
        missingRange: RDatasetSnapshotMissingRange | null;
        declared: boolean;
    }>;
}

export interface RDatasetEditorSnapshotCommandRequest {
    datasetName: string;
    rowStart?: number;
    rowCount?: number;
    columnStart?: number;
    columnCount?: number;
}

export interface RDatasetEditorVariableBatchCommandRequest {
    datasetName: string;
    start?: number;
    count?: number;
}

export const cleanRDatasetSnapshotCell = function(value: unknown): string {
    return String(value ?? "").replace(/\r/g, " ").replace(/\n/g, " ");
};

export const rStringLiteral = function(value: unknown): string {
    return JSON.stringify(String(value ?? ""));
};

const decodeDatasetPart = function(value: unknown): string {
    try {
        return decodeURIComponent(String(value || ""));
    }
    catch (_error) {
        return String(value || "");
    }
};

const parseCategoryState = function(text: unknown): RDatasetSnapshotCategoryState[] {
    const source = String(text || "");

    if (!source) {
        return [];
    }

    return source.split("\u001e").map((entry) => {
        const parts = entry.split("\u001f");

        return {
            value: decodeDatasetPart(parts[0] || ""),
            label: decodeDatasetPart(parts[1] || ""),
            isMissing: parts[2] === "true"
        };
    }).filter((entry) => entry.value || entry.label);
};

const parseMissingRange = function(text: unknown): RDatasetSnapshotMissingRange | null {
    const source = String(text || "");

    if (!source) {
        return null;
    }

    const parts = source.split("\u001f");
    const minimum = decodeDatasetPart(parts[0] || "");
    const maximum = decodeDatasetPart(parts[1] || "");

    if (!minimum || !maximum) {
        return null;
    }

    return {
        min: minimum,
        max: maximum
    };
};

const parseCellState = function(text: unknown): { display: string; declaredMissing: boolean } {
    const parts = String(text || "").split("\u001f");

    return {
        display: cleanRDatasetSnapshotCell(decodeDatasetPart(parts[0] || "")),
        declaredMissing: parts[1] === "true"
    };
};

const summarizeValues = function(
    categories: RDatasetSnapshotCategoryState[],
    missingRange: RDatasetSnapshotMissingRange | null,
    fallback: unknown
): string {
    const preview = Array.isArray(categories)
        ? categories.slice(0, 2).map((category) => {
            return String(category.label || category.value || "").trim();
        }).filter(Boolean)
        : [];

    if (preview.length) {
        return preview.join(", ");
    }

    if (missingRange?.min && missingRange?.max) {
        return `range ${missingRange.min}:${missingRange.max}`;
    }

    return cleanRDatasetSnapshotCell(fallback);
};

export const parseRDatasetEditorSnapshot = function(
    text: unknown,
    datasetName: string
): RDatasetEditorSnapshot {
    const snapshot: RDatasetEditorSnapshot = {
        name: datasetName,
        rowCount: 0,
        columnCount: 0,
        rowStart: 1,
        columnStart: 1,
        allColumns: [],
        columns: [],
        rows: [],
        variables: []
    };

    for (const line of String(text || "").split("\n")) {
        const parts = line.split("\t");
        const kind = parts.shift();

        if (kind === "META") {
            snapshot.rowCount = Number(parts[0] || 0) || 0;
            snapshot.columnCount = Number(parts[1] || 0) || 0;
            continue;
        }

        if (kind === "WINDOW") {
            snapshot.rowStart = Number(parts[0] || 1) || 1;
            snapshot.columnStart = Number(parts[1] || 1) || 1;
            continue;
        }

        if (kind === "ALL_COLUMNS") {
            snapshot.allColumns = parts.map(cleanRDatasetSnapshotCell);
            continue;
        }

        if (kind === "COLUMNS") {
            snapshot.columns = parts.map(cleanRDatasetSnapshotCell);
            continue;
        }

        if (kind === "ROW") {
            snapshot.rows.push({
                index: Number(parts.shift() || 0) || snapshot.rows.length + 1,
                name: cleanRDatasetSnapshotCell(parts.shift() || ""),
                values: parts.map(parseCellState)
            });
            continue;
        }

        if (kind === "VAR") {
            const categories = parseCategoryState(parts[9] || "");
            const missingRange = parseMissingRange(parts[10] || "");

            snapshot.variables.push({
                index: Number(parts[0] || 0) || snapshot.variables.length + 1,
                name: cleanRDatasetSnapshotCell(parts[1] || ""),
                type: cleanRDatasetSnapshotCell(parts[2] || ""),
                width: Number(parts[3] || 0) || 0,
                decimals: Number(parts[4] || 0) || 0,
                label: cleanRDatasetSnapshotCell(parts[5] || ""),
                values: summarizeValues(categories, missingRange, parts[6] || ""),
                align: cleanRDatasetSnapshotCell(parts[7] || ""),
                measure: cleanRDatasetSnapshotCell(parts[8] || ""),
                categories,
                missingRange,
                declared: parts[11] === "true"
            });
        }
    }

    if (!snapshot.allColumns.length) {
        snapshot.allColumns = snapshot.columns.slice();
    }

    return snapshot;
};

export const rDatasetEditorSnapshotPrelude = function(): string[] {
    return [
        "  .clean <- function(value) {",
        "    value <- as.character(value)",
        "    value[is.na(value)] <- \"NA\"",
        "    gsub(\"[\\t\\r\\n]\", \" \", value)",
        "  }",
        "  .enc <- function(value) {",
        "    if (is.null(value) || !length(value) || is.na(value[[1]])) value <- \"\"",
        "    utils::URLencode(as.character(value[[1]]), reserved = TRUE)",
        "  }",
        "  .measurement <- function(value) {",
        "    .measure <- attr(value, \"measurement\", exact = TRUE)",
        "    if (is.null(.measure)) .measure <- attr(value, \"measure\", exact = TRUE)",
        "    if (is.null(.measure) || !nzchar(as.character(.measure))) .measure <- if (is.numeric(value) || is.integer(value)) \"scale\" else \"nominal\"",
        "    .measure <- as.character(.measure)",
        "    if (.measure == \"scale\") .measure <- \"interval\"",
        "    .measure",
        "  }",
        "  .alignment <- function(value) {",
        "    .align <- attr(value, \"align\", exact = TRUE)",
        "    if (is.null(.align) || !nzchar(as.character(.align))) .align <- if (is.numeric(value) || is.integer(value)) \"right\" else \"left\"",
        "    as.character(.align)",
        "  }",
        "  .category_state <- function(value) {",
        "    .labels <- attr(value, \"labels\", exact = TRUE)",
        "    .na_values <- attr(value, \"na_values\", exact = TRUE)",
        "    if (!is.null(.labels) && length(.labels)) {",
        "      .values <- as.character(unname(.labels))",
        "      .names <- names(.labels)",
        "      .names[is.na(.names) | !nzchar(.names)] <- .values[is.na(.names) | !nzchar(.names)]",
        "    } else if (is.factor(value)) {",
        "      .values <- levels(value)",
        "      .names <- .values",
        "    } else {",
        "      .values <- character(0)",
        "      .names <- character(0)",
        "    }",
        "    if (!length(.values)) return(\"\")",
        "    paste(vapply(seq_along(.values), function(.index) {",
        "      paste(.enc(.values[[.index]]), .enc(.names[[.index]]), if (is.element(as.character(.values[[.index]]), as.character(.na_values))) \"true\" else \"false\", sep = \"\\u001f\")",
        "    }, character(1)), collapse = \"\\u001e\")",
        "  }",
        "  .range_state <- function(value) {",
        "    .range <- attr(value, \"na_range\", exact = TRUE)",
        "    if (is.null(.range) || length(.range) < 2L) return(\"\")",
        "    paste(.enc(.range[[1]]), .enc(.range[[2]]), sep = \"\\u001f\")",
        "  }",
        "  .declared_index_value <- function(column, row) {",
        "    .index <- attr(column, \"na_index\", exact = TRUE)",
        "    if (is.null(.index) || !length(.index) || !is.element(row, .index)) return(NULL)",
        "    .position <- match(row, .index)",
        "    .names <- names(.index)",
        "    if (is.null(.names) || length(.names) < .position) return(\"\")",
        "    as.character(.names[[.position]])",
        "  }",
        "  .declared_missing <- function(column, cell) {",
        "    .na_values <- attr(column, \"na_values\", exact = TRUE)",
        "    .na_range <- attr(column, \"na_range\", exact = TRUE)",
        "    .value_match <- !is.null(.na_values) && is.element(as.character(cell), as.character(.na_values))",
        "    .range_match <- FALSE",
        "    if (!is.null(.na_range) && length(.na_range) >= 2L) {",
        "      .cell <- suppressWarnings(as.numeric(cell))",
        "      .range <- suppressWarnings(as.numeric(.na_range[seq_len(2L)]))",
        "      .range_match <- !is.na(.cell) && !any(is.na(.range)) && .cell >= min(.range) && .cell <= max(.range)",
        "    }",
        "    isTRUE(.value_match || .range_match)",
        "  }",
        "  .cell_state <- function(column, row) {",
        "    .cell <- column[[row]]",
        "    .declared_value <- if (length(.cell) == 1L && is.na(.cell)) .declared_index_value(column, row) else NULL",
        "    if (!is.null(.declared_value)) return(paste(.enc(.declared_value), \"true\", sep = \"\\u001f\"))",
        "    cell <- .cell",
        "    paste(.enc(.clean(cell)), if (.declared_missing(column, cell)) \"true\" else \"false\", sep = \"\\u001f\")",
        "  }",
        "  .variable_state <- function(.df, .column) {",
        "    .value <- .df[[.column]]",
        "    .type <- class(.value)[1]",
        "    .measure <- .measurement(.value)",
        "    .align <- .alignment(.value)",
        "    .label <- attr(.value, \"label\", exact = TRUE)",
        "    if (is.null(.label)) .label <- \"\"",
        "    .width <- max(1L, suppressWarnings(as.integer(attr(.value, \"width\", exact = TRUE) %||% max(nchar(.clean(.value)), na.rm = TRUE))))",
        "    if (!is.finite(.width)) .width <- 1L",
        "    .decimals <- suppressWarnings(as.integer(attr(.value, \"decimals\", exact = TRUE) %||% 0L))",
        "    if (!is.finite(.decimals)) .decimals <- 0L",
        "    .values <- if (is.factor(.value)) paste(levels(.value), collapse = \", \") else \"\"",
        "    paste(c(\"VAR\", .column, .clean(colnames(.df)[.column]), .clean(.type), .width, .decimals, .clean(.label), .clean(.values), .clean(.align), .clean(.measure), .category_state(.value), .range_state(.value), if (inherits(.value, \"declared\")) \"true\" else \"false\"), collapse = \"\\t\")",
        "  }"
    ];
};


const positiveInteger = function(value: unknown, fallback: number): number {
    return Math.max(1, Math.floor(Number(value) || fallback));
};


export const buildRDatasetEditorSnapshotCommand = function(
    request: RDatasetEditorSnapshotCommandRequest
): string {
    const rowStart = positiveInteger(request.rowStart, 1);
    const rowCount = positiveInteger(request.rowCount, 40);
    const columnStart = positiveInteger(request.columnStart, 1);
    const columnCount = positiveInteger(request.columnCount, 32);

    return [
        "local({",
        `  .name <- ${rStringLiteral(request.datasetName)}`,
        `  .row_start <- ${JSON.stringify(rowStart)}`,
        `  .row_count_requested <- ${JSON.stringify(rowCount)}`,
        `  .column_start <- ${JSON.stringify(columnStart)}`,
        `  .column_count_requested <- ${JSON.stringify(columnCount)}`,
        "  `%||%` <- function(left, right) if (is.null(left)) right else left",
        ...rDatasetEditorSnapshotPrelude(),
        "  if (!exists(.name, envir = .GlobalEnv, inherits = FALSE)) return(\"\")",
        "  .df <- get(.name, envir = .GlobalEnv)",
        "  if (!is.data.frame(.df)) return(\"\")",
        "  .row_count <- nrow(.df)",
        "  .column_count <- ncol(.df)",
        "  .columns <- colnames(.df)",
        "  .row_end <- min(.row_count, .row_start + .row_count_requested - 1L)",
        "  .column_end <- min(.column_count, .column_start + .column_count_requested - 1L)",
        "  .row_index <- if (.row_count > 0L && .row_start <= .row_end) seq.int(.row_start, .row_end) else integer(0)",
        "  .column_index <- if (.column_count > 0L && .column_start <= .column_end) seq.int(.column_start, .column_end) else integer(0)",
        "  .lines <- c(",
        "    paste(\"META\", .row_count, .column_count, sep = \"\\t\"),",
        "    paste(\"WINDOW\", if (length(.row_index)) .row_index[[1]] else .row_start, if (length(.column_index)) .column_index[[1]] else .column_start, sep = \"\\t\"),",
        "    paste(c(\"ALL_COLUMNS\", .clean(.columns)), collapse = \"\\t\"),",
        "    paste(c(\"COLUMNS\", .clean(.columns[.column_index])), collapse = \"\\t\")",
        "  )",
        "  if (length(.row_index) && length(.column_index)) {",
        "    .lines <- c(.lines, vapply(.row_index, function(.row) {",
        "      .values <- vapply(.column_index, function(.column) .cell_state(.df[[.column]], .row), character(1))",
        "      paste(c(\"ROW\", .row, .clean(rownames(.df)[.row]), .values), collapse = \"\\t\")",
        "    }, character(1)))",
        "  }",
        "  paste(.lines, collapse = \"\\n\")",
        "})"
    ].join("\n");
};


export const buildRDatasetEditorVariableBatchCommand = function(
    request: RDatasetEditorVariableBatchCommandRequest
): string {
    const start = positiveInteger(request.start, 1);
    const count = positiveInteger(request.count, 64);

    return [
        "local({",
        `  .name <- ${rStringLiteral(request.datasetName)}`,
        `  .start <- ${JSON.stringify(start)}`,
        `  .count <- ${JSON.stringify(count)}`,
        "  `%||%` <- function(left, right) if (is.null(left)) right else left",
        ...rDatasetEditorSnapshotPrelude(),
        "  if (!exists(.name, envir = .GlobalEnv, inherits = FALSE)) return(\"\")",
        "  .df <- get(.name, envir = .GlobalEnv)",
        "  if (!is.data.frame(.df)) return(\"\")",
        "  .column_count <- ncol(.df)",
        "  .end <- min(.column_count, .start + .count - 1L)",
        "  if (.column_count < 1L || .start > .end) return(\"\")",
        "  paste(vapply(seq.int(.start, .end), function(.column) {",
        "    .variable_state(.df, .column)",
        "  }, character(1)), collapse = \"\\n\")",
        "})"
    ].join("\n");
};

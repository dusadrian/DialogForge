export const buildRFastWorkspaceTextSnapshotCommand = function(): string {
    return [
        "local({",
        "  names <- ls(envir = .GlobalEnv)",
        "  if (!length(names)) return(\"\")",
        "  paste(vapply(names, function(name) {",
        "    object <- get(name, envir = .GlobalEnv)",
        "    kind <- class(object)[1]",
        "    rows <- if (is.data.frame(object) || is.matrix(object)) nrow(object) else length(object)",
        "    columns <- if (is.data.frame(object) || is.matrix(object)) ncol(object) else 0L",
        "    paste(name, kind, rows, columns, sep = \"\\t\")",
        "  }, character(1)), collapse = \"\\n\")",
        "})"
    ].join("\n");
};


export const buildRRemoveWorkspaceObjectCommand = function(name: unknown): string {
    return `rm(list = ${JSON.stringify(String(name || ""))})`;
};


export const buildRClearWorkspaceCommand = function(): string {
    return "rm(list = ls())";
};


export const buildRWorkspaceTextSnapshotCommand = function(): string {
    return [
        "local({",
        "  names <- ls(envir = .GlobalEnv)",
        "  if (!length(names)) return(\"\")",
        "  paste(vapply(names, function(name) {",
        "    object <- get(name, envir = .GlobalEnv)",
        "    kind <- class(object)[1]",
        "    rows <- if (is.data.frame(object) || is.matrix(object)) nrow(object) else length(object)",
        "    columns <- if (is.data.frame(object) || is.matrix(object)) paste(colnames(object), collapse = \",\") else \"\"",
        "    flags <- \"\"",
        "    if (is.data.frame(object)) {",
        "      flags <- paste(vapply(object, function(column) {",
        "        flag <- character(0)",
        "        declared_namespace <- if (requireNamespace(\"declared\", quietly = TRUE)) asNamespace(\"declared\") else NULL",
        "        source <- if (!is.null(declared_namespace) && inherits(column, \"declared\")) {",
        "          tryCatch(get(\"undeclare\", envir = declared_namespace)(column, drop = TRUE), error = function(error) column)",
        "        } else column",
        "        labels <- tryCatch(attr(column, \"labels\", exact = TRUE), error = function(error) NULL)",
        "        measure_attribute <- tryCatch(attr(column, \"measurement\", exact = TRUE), error = function(error) NULL)",
        "        measure <- if (is.null(measure_attribute) || !length(measure_attribute)) \"\" else trimws(as.character(measure_attribute[[1]]))",
        "        if (!nzchar(measure) && !is.null(declared_namespace)) {",
        "          likely_measure <- tryCatch(get(\"likely_measurement\", envir = declared_namespace)(column), error = function(error) \"\")",
        "          measure <- if (is.null(likely_measure) || !length(likely_measure)) \"\" else trimws(as.character(likely_measure[[1]]))",
        "        }",
        "        if (identical(measure, \"quantitative\")) measure <- \"interval\"",
        "        if (identical(measure, \"categorical\")) measure <- if (is.ordered(source)) \"ordinal\" else \"nominal\"",
        "        category_count <- if (!is.null(labels) && length(labels)) length(as.character(labels)) else if (is.factor(source)) length(levels(source)) else 0L",
        "        is_date <- inherits(source, \"Date\")",
        "        is_character <- is.character(source)",
        "        is_categorical <- is.factor(source) || is_character || is.logical(source) || (!is.null(labels) && length(labels) > 0L) || identical(measure, \"nominal\") || identical(measure, \"ordinal\")",
        "        intrinsic_numeric <- !is_date && (is.numeric(source) || is.integer(source) || is.logical(source))",
        "        ordinal_numeric <- identical(measure, \"ordinal\") && category_count >= 7L",
        "        nominal_non_numeric <- identical(measure, \"nominal\") && category_count > 0L",
        "        is_numeric <- (isTRUE(intrinsic_numeric) && !isTRUE(nominal_non_numeric)) || isTRUE(ordinal_numeric)",
        "        if (is_numeric) flag <- c(flag, \"numeric\")",
        "        if (is_categorical) flag <- c(flag, \"categorical\", \"factor\")",
        "        if (is_character) flag <- c(flag, \"character\")",
        "        if (is.logical(source) || category_count == 2L) flag <- c(flag, \"binary\")",
        "        if (is_date) flag <- c(flag, \"date\")",
        "        paste(flag, collapse = \"/\")",
        "      }, character(1)), collapse = \",\")",
        "    }",
        "    paste(name, kind, rows, columns, flags, sep = \"\\t\")",
        "  }, character(1)), collapse = \"\\n\")",
        "})"
    ].join("\n");
};

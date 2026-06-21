if (!is.element("DialogApp", search())) {
    attach(NULL, name = "DialogApp", warn.conflicts = FALSE)
}

backend_environment <- as.environment("DialogApp")


backend_environment$`%||%` <- function(value, fallback) {
    if (is.null(value)) fallback else value
}


backend_json_escape <- function(value) {
    text <- enc2utf8(as.character(value %||% ""))
    text <- gsub("\\\\", "\\\\\\\\", text, fixed = TRUE)
    text <- gsub('"', '\\"', text, fixed = TRUE)
    text <- gsub("\n", "\\n", text, fixed = TRUE)
    text <- gsub("\r", "\\r", text, fixed = TRUE)
    gsub("\t", "\\t", text, fixed = TRUE)
}


backend_json_atomic <- function(value) {
    if (is.logical(value)) {
        if (is.na(value)) return("null")

        return(if (isTRUE(value)) "true" else "false")
    }

    if (is.numeric(value)) {
        if (is.na(value) || !is.finite(value)) return("null")

        return(as.character(value))
    }

    if (is.character(value)) {
        return(paste0('"', backend_json_escape(value), '"'))
    }

    NULL
}


backend_json_array <- function(values) {
    paste0(
        "[",
        paste(vapply(values, backend_json, character(1)), collapse = ","),
        "]"
    )
}


backend_json_object <- function(value) {
    names <- names(value)
    fields <- vapply(seq_along(value), function(index) {
        paste0(
            '"', backend_json_escape(names[[index]]), '":',
            backend_json(value[[index]])
        )
    }, character(1))

    paste0("{", paste(fields, collapse = ","), "}")
}


backend_json <- function(value) {
    if (is.null(value)) return("null")

    if (is.atomic(value) && length(value) > 1L) {
        return(backend_json_array(as.list(value)))
    }

    atomic <- backend_json_atomic(value)

    if (!is.null(atomic)) return(atomic)

    if (is.list(value)) {
        names <- names(value)

        if (is.null(names) || !any(nzchar(names))) {
            return(backend_json_array(value))
        }

        return(backend_json_object(value))
    }

    description <- paste(
        utils::capture.output(utils::str(value, give.attr = FALSE)),
        collapse = " "
    )

    paste0('"', backend_json_escape(description), '"')
}


backend_environment$json_escape <- backend_json_escape
backend_environment$json <- backend_json


backend_environment$dialog_emit <- function(payload) {
    cat(backend_json(payload), "\n", sep = "")
}


backend_environment$dialog_check_completeness <- function(cmd = "") {
    command <- as.character(cmd %||% "")

    tryCatch({
        parse(text = command)
        list(state = "complete")
    }, error = function(error) {
        message <- conditionMessage(error)
        incomplete <- grepl(
            "unexpected end of input|unexpected end of line|incomplete final line",
            message,
            ignore.case = TRUE
        )

        list(state = if (incomplete) "incomplete" else "invalid")
    })
}


backend_import_encoding <- function(file_encoding) {
    encoding <- trimws(as.character(file_encoding %||% ""))

    if (nzchar(encoding)) encoding else NULL
}


backend_import_row_names <- function(row_names) {
    value <- suppressWarnings(as.integer(row_names %||% 0L))

    if (isTRUE(value == 1L)) 1L else NULL
}


backend_import_binary <- function(path, rows, encoding) {
    DDIwR::convert(
        from = path,
        to = NULL,
        declared = FALSE,
        encoding = encoding,
        n_max = rows
    )
}


backend_import_text <- function(
    path,
    rows,
    header,
    row_names,
    sep,
    quote,
    dec,
    na_strings,
    skip,
    strip_white,
    comment_char,
    encoding
) {
    utils::read.table(
        file = path,
        header = isTRUE(header),
        row.names = backend_import_row_names(row_names),
        sep = as.character(sep %||% ""),
        quote = as.character(quote %||% "\""),
        dec = as.character(dec %||% "."),
        na.strings = as.character(na_strings %||% "NA"),
        skip = max(0L, as.integer(skip %||% 0L)),
        strip.white = isTRUE(strip_white),
        comment.char = as.character(comment_char %||% "#"),
        fileEncoding = encoding,
        nrows = rows,
        as.is = TRUE,
        check.names = FALSE,
        fill = TRUE,
        stringsAsFactors = FALSE
    )
}


backend_environment$dialog_import_preview <- function(
    file_path = "",
    reader = "read.table",
    is_binary = FALSE,
    nrows = 8L,
    header = TRUE,
    row_names = 0L,
    sep = "",
    quote = "\"",
    dec = ".",
    na_strings = "NA",
    skip = 0L,
    strip_white = FALSE,
    comment_char = "#",
    file_encoding = ""
) {
    path <- as.character(file_path %||% "")
    rows <- max(1L, as.integer(nrows %||% 8L))
    encoding <- backend_import_encoding(file_encoding)
    preview <- tryCatch({
        if (isTRUE(is_binary)) {
            backend_import_binary(path, rows, encoding)
        } else {
            backend_import_text(
                path,
                rows,
                header,
                row_names,
                sep,
                quote,
                dec,
                na_strings,
                skip,
                strip_white,
                comment_char,
                encoding
            )
        }
    }, error = function(error) error)

    if (inherits(preview, "error")) {
        return(list(error = conditionMessage(preview)))
    }

    preview <- tryCatch(
        as.data.frame(preview, stringsAsFactors = FALSE, check.names = FALSE),
        error = function(error) error
    )

    if (inherits(preview, "error")) {
        return(list(error = conditionMessage(preview)))
    }

    column_names <- as.character(colnames(preview) %||% character(0))
    values <- lapply(column_names, function(name) {
        as.character(preview[[name]])
    })

    list(colnames = column_names, vdata = values)
}


backend_package_names <- function(packages) {
    packages <- unique(as.character(packages %||% character(0)))
    packages[nzchar(packages)]
}


backend_environment$dialog_outdated_packages <- function(
    packages = character(0),
    repos = NULL
) {
    packages <- backend_package_names(packages)

    if (!length(packages)) return(character(0))

    installed <- installed.packages()
    available <- tryCatch(
        available.packages(repos = repos),
        error = function(error) NULL
    )

    if (is.null(available)) {
        stop("Unable to query CRAN for package updates.")
    }

    packages <- packages[is.element(packages, rownames(installed))]
    packages <- packages[is.element(packages, rownames(available))]

    packages[vapply(packages, function(package) {
        utils::compareVersion(
            as.character(available[package, "Version"]),
            as.character(installed[package, "Version"])
        ) > 0L
    }, logical(1))]
}


backend_environment$dialog_package_status <- function(packages = character(0)) {
    packages <- backend_package_names(packages)

    list(
        missing = packages[!vapply(packages, function(package) {
            requireNamespace(package, quietly = TRUE)
        }, logical(1))],
        attached = packages[vapply(packages, function(package) {
            is.element(paste0("package:", package), search())
        }, logical(1))]
    )
}


backend_environment$dialog_package_status_text <- function(packages = character(0)) {
    status <- dialog_package_status(packages)

    paste(
        paste(as.character(status$missing %||% character(0)), collapse = ","),
        paste(as.character(status$attached %||% character(0)), collapse = ","),
        sep = "|"
    )
}


backend_environment$dialog_is_package_attached <- function(package_name = "") {
    package <- as.character(package_name %||% "")

    if (!length(package)) return(FALSE)

    package <- trimws(package[[1]])

    nzchar(package) && is.element(paste0("package:", package), search())
}


backend_last_expression_returns_value <- function(expression) {
    if (!length(expression)) return(FALSE)

    last <- expression[[length(expression)]]

    if (!is.call(last)) return(TRUE)

    operator <- as.character(last[[1]])
    !is.element(operator, c("<-", "="))
}


backend_evaluate_expressions <- function(expressions, return_value) {
    value <- NULL

    for (expression in expressions) {
        value <- eval(expression, envir = .GlobalEnv)
    }

    if (!isTRUE(return_value)) return(NULL)
    if (!backend_last_expression_returns_value(expressions)) return(NULL)

    value
}


backend_environment$dialog_run <- function(cmd, return_value = TRUE) {
    tryCatch({
        expressions <- parse(text = as.character(cmd %||% ""))
        value <- backend_evaluate_expressions(expressions, return_value)

        list(
            ok = TRUE,
            result = if (isTRUE(return_value)) value else NULL
        )
    }, error = function(error) {
        list(ok = FALSE, error = conditionMessage(error))
    })
}


backend_environment$dialog_init <- function() {
    assign("dialog_emit", dialog_emit, envir = .GlobalEnv)

    invisible(TRUE)
}


rm(backend_environment)

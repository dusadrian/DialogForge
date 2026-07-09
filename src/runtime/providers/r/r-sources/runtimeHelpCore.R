help_package_name <- function(package) {
    package <- as.character(package %||% "")
    if (nzchar(package)) package else NULL
}


help_files <- function(topic, package = NULL) {
    topic <- as.character(topic %||% "")

    if (!nzchar(topic)) return(character(0))

    help <- tryCatch({
        if (is.null(package)) {
            utils::help(
                topic = topic,
                help_type = "html",
                try.all.packages = TRUE
            )
        }
        else {
            utils::help(
                topic = topic,
                package = package,
                help_type = "html"
            )
        }
    }, error = function(error) NULL)

    as.character(help %||% character(0))
}


help_normalize_path <- function(path) {
    tryCatch(
        normalizePath(
            as.character(path %||% ""),
            winslash = "/",
            mustWork = FALSE
        ),
        error = function(error) ""
    )
}


help_path_parts <- function(path) {
    path <- help_normalize_path(path)

    if (!nzchar(path)) {
        return(list(topic = "", package = "", library = "", path = ""))
    }

    topic <- tryCatch(basename(path), error = function(error) "")
    package_directory <- tryCatch(
        dirname(dirname(path)),
        error = function(error) ""
    )
    package <- tryCatch(
        basename(package_directory),
        error = function(error) ""
    )
    library <- tryCatch(
        dirname(package_directory),
        error = function(error) ""
    )

    list(
        topic = topic,
        package = package,
        library = library,
        path = if (nzchar(package) && nzchar(topic)) {
            paste0("/library/", package, "/html/", topic, ".html")
        }
        else {
            ""
        }
    )
}


help_path <- function(topic, package = NULL) {
    files <- help_files(topic, help_package_name(package))

    if (!length(files)) return("")

    help_path_parts(files[[1]])$path
}


help_title <- function(path, fallback) {
    path <- help_normalize_path(path)
    document <- tryCatch(
        utils:::.getHelpFile(path),
        error = function(error) NULL
    )

    if (is.null(document) || !length(document)) return(fallback)

    tags <- tryCatch(vapply(document, function(item) {
        as.character(attr(item, "Rd_tag") %||% "")
    }, character(1)), error = function(error) character(0))
    title_index <- tryCatch(
        which(tags == "\\title")[[1]],
        error = function(error) NA_integer_
    )

    if (
        !is.finite(title_index) ||
        is.na(title_index) ||
        title_index < 1L ||
        title_index > length(document)
    ) {
        return(fallback)
    }

    tryCatch(
        paste(unlist(document[[title_index]]), collapse = ""),
        error = function(error) fallback
    )
}


help_match <- function(path) {
    parts <- help_path_parts(path)

    list(
        topic = parts$topic,
        title = help_title(path, parts$topic),
        package = parts$package,
        packagePath = if (nzchar(parts$package)) {
            paste0("/library/", parts$package, "/html/00Index.html")
        }
        else {
            ""
        },
        library = parts$library,
        path = parts$path
    )
}


help_html <- function(path) {
    path <- help_normalize_path(path)

    if (!nzchar(path)) return("")

    output <- tempfile(fileext = ".html")
    on.exit(unlink(output), add = TRUE)

    tryCatch({
        document <- utils:::.getHelpFile(path)
        tools::Rd2HTML(document, out = output)
        paste(
            readLines(output, warn = FALSE, encoding = "UTF-8"),
            collapse = "\n"
        )
    }, error = function(error) "")
}


help_matches <- function(topic, package = NULL) {
    topic <- as.character(topic %||% "")

    if (!nzchar(topic)) return(list(kind = "single", path = ""))

    files <- help_files(topic, help_package_name(package))

    if (!length(files)) return(list(kind = "single", path = ""))

    matches <- lapply(files, help_match)
    matches <- Filter(function(match) {
        is.list(match) && nzchar(as.character(match$path %||% ""))
    }, matches)

    if (!length(matches)) return(list(kind = "single", path = ""))

    if (length(matches) == 1L) {
        return(list(
            kind = "single",
            path = as.character(matches[[1]]$path %||% ""),
            body = help_html(files[[1]])
        ))
    }

    list(kind = "multiple", topic = topic, matches = matches)
}


help_search_match <- function(matches, index) {
    row <- matches[index, , drop = FALSE]
    topic <- as.character(row$Topic[[1]] %||% "")
    package <- as.character(row$Package[[1]] %||% "")

    list(
        topic = topic,
        title = as.character(row$Title[[1]] %||% topic),
        package = package,
        packagePath = if (nzchar(package)) {
            paste0("/library/", package, "/html/00Index.html")
        }
        else {
            ""
        },
        library = as.character(row$LibPath[[1]] %||% ""),
        path = if (nzchar(package) && nzchar(topic)) {
            paste0("/library/", package, "/html/", topic, ".html")
        }
        else {
            ""
        }
    )
}


help_search_matches <- function(topic) {
    topic <- as.character(topic %||% "")

    if (!nzchar(topic)) {
        return(list(kind = "search", topic = "", matches = list()))
    }

    found <- tryCatch(
        utils::help.search(
            topic,
            fields = c("alias", "concept", "title")
        ),
        error = function(error) NULL
    )
    matches <- tryCatch(
        as.data.frame(found$matches, stringsAsFactors = FALSE),
        error = function(error) data.frame()
    )

    if (!nrow(matches)) {
        return(list(kind = "search", topic = topic, matches = list()))
    }

    matches <- matches[
        seq_len(min(nrow(matches), 40L)),
        ,
        drop = FALSE
    ]
    result <- lapply(seq_len(nrow(matches)), function(index) {
        help_search_match(matches, index)
    })
    result <- Filter(function(match) {
        is.list(match) && nzchar(as.character(match$path %||% ""))
    }, result)

    list(kind = "search", topic = topic, matches = result)
}


json_help_match <- function(match) {
    paste0(
        "{\"topic\":", json_str(as.character(match$topic %||% "")), ",",
        "\"title\":", json_str(as.character(match$title %||% "")), ",",
        "\"package\":", json_str(as.character(match$package %||% "")), ",",
        "\"packagePath\":",
        json_str(as.character(match$packagePath %||% "")), ",",
        "\"library\":", json_str(as.character(match$library %||% "")), ",",
        "\"path\":", json_str(as.character(match$path %||% "")),
        "}"
    )
}


json_help_matches <- function(matches) {
    if (!length(matches)) return("")
    paste(vapply(matches, json_help_match, character(1)), collapse = ",")
}


json_help_result <- function(result) {
    kind <- as.character(result$kind %||% "single")

    if (is.element(kind, c("multiple", "search"))) {
        return(paste0(
            "{\"kind\":", json_str(kind), ",",
            "\"topic\":", json_str(as.character(result$topic %||% "")), ",",
            "\"matches\":[", json_help_matches(result$matches %||% list()), "]",
            "}"
        ))
    }

    paste0(
        "{\"kind\":", json_str("single"), ",",
        "\"path\":", json_str(as.character(result$path %||% "")), ",",
        "\"body\":", json_str(as.character(result$body %||% "")),
        "}"
    )
}


json_working_directory_result <- function(result) {
    paste0(
        "{\"path\":",
        json_str(as.character(result$path %||% "")),
        "}"
    )
}


json_completeness_warning <- function(warning) {
    paste0(
        "{\"name\":", json_str(as.character(warning$name %||% "")), ",",
        "\"message\":", json_str(as.character(warning$message %||% "")), ",",
        "\"line\":", as.character(
            suppressWarnings(as.integer(warning$line %||% 0L))
        ), ",",
        "\"column\":", as.character(
            suppressWarnings(as.integer(warning$column %||% 0L))
        ),
        "}"
    )
}


json_completeness_result <- function(result) {
    warnings <- result$warnings %||% list()
    warning_json <- if (length(warnings)) {
        paste(vapply(warnings, json_completeness_warning, character(1)), collapse = ",")
    }
    else {
        ""
    }

    paste0(
        "{\"state\":", json_str(as.character(result$state %||% "unknown")), ",",
        "\"message\":", json_str(as.character(result$message %||% "")), ",",
        "\"warnings\":[", warning_json, "]",
        "}"
    )
}


json_completion_item <- function(item) {
    paste0(
        "{\"label\":", json_str(as.character(item$label %||% "")), ",",
        "\"kind\":", json_str(as.character(item$kind %||% "file")),
        "}"
    )
}


json_completion_items <- function(items) {
    if (is.null(items) || !length(items)) return("[]")

    paste0(
        "[",
        paste(vapply(items, json_completion_item, character(1)), collapse = ","),
        "]"
    )
}


json_completion_result <- function(result) {
    paste0(
        "{\"exports\":",
        json_strv(as.character(result$exports %||% character(0))), ",",
        "\"internals\":",
        json_strv(as.character(result$internals %||% character(0))), ",",
        "\"symbols\":",
        json_strv(as.character(result$symbols %||% character(0))), ",",
        "\"items\":", json_completion_items(result$items %||% list()),
        "}"
    )
}

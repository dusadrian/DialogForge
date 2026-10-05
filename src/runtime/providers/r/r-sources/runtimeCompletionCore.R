completion_cursor_prefix <- function(code, cursor_column) {
    source <- as.character(code %||% "")

    if (!nzchar(source)) return(NULL)

    cursor <- suppressWarnings(as.integer(
        cursor_column %||% (nchar(source) + 1L)
    ))

    if (!is.finite(cursor) || is.na(cursor)) {
        cursor <- nchar(source) + 1L
    }

    cursor <- max(1L, min(nchar(source) + 1L, cursor))
    substr(source, 1L, max(0L, cursor - 1L))
}


completion_open_quote <- function(source) {
    characters <- strsplit(source, "", fixed = TRUE)[[1]]
    quote <- ""
    start <- NA_integer_
    escaped <- FALSE

    for (index in seq_along(characters)) {
        character <- characters[[index]]

        if (isTRUE(escaped)) {
            escaped <- FALSE
            next
        }

        if (identical(character, "\\")) {
            escaped <- TRUE
            next
        }

        if (!nzchar(quote)) {
            if (is.element(character, c("\"", "'"))) {
                quote <- character
                start <- index
            }

            next
        }

        if (identical(character, quote)) {
            quote <- ""
            start <- NA_integer_
        }
    }

    if (!nzchar(quote) || !is.finite(start) || is.na(start)) {
        return(NULL)
    }

    content <- if (start < length(characters)) {
        paste0(
            characters[seq.int(start + 1L, length(characters))],
            collapse = ""
        )
    }
    else {
        ""
    }

    list(content = content, quote = quote)
}


completion_last_path_separator <- function(path) {
    positions <- gregexpr("[/\\\\]", path, perl = TRUE)[[1]]
    position <- suppressWarnings(max(c(positions, -1L), na.rm = TRUE))

    if (!is.finite(position) || is.na(position)) -1L else position
}


completion_path_parts <- function(path) {
    separator <- completion_last_path_separator(path)

    list(
        directory = if (separator >= 0L) {
            substr(path, 1L, separator)
        }
        else {
            ""
        },
        token = if (separator >= 0L) {
            substr(path, separator + 1L, nchar(path))
        }
        else {
            path
        }
    )
}


completion_empty_result <- function() {
    list(
        exports = character(0),
        internals = character(0),
        symbols = character(0),
        items = list()
    )
}


completion_path_context <- function(code, cursor_column) {
    prefix <- completion_cursor_prefix(code, cursor_column)

    if (is.null(prefix)) return(NULL)

    quote <- completion_open_quote(prefix)

    if (is.null(quote)) return(NULL)

    parts <- completion_path_parts(quote$content)
    list(prefix = quote$content, token = parts$token)
}


completion_path_result <- function(context) {
    prefix <- as.character((context %||% list())$prefix %||% "")
    parts <- completion_path_parts(prefix)
    search_directory <- if (nzchar(parts$directory)) {
        tryCatch(
            path.expand(parts$directory),
            error = function(error) ""
        )
    }
    else {
        getwd()
    }

    if (!nzchar(search_directory) || !dir.exists(search_directory)) {
        return(completion_empty_result())
    }

    entries <- tryCatch(
        list.files(
            search_directory,
            all.files = startsWith(parts$token, "."),
            no.. = TRUE
        ),
        error = function(error) character(0)
    )

    if (nzchar(parts$token)) {
        entries <- entries[startsWith(entries, parts$token)]
    }

    entries <- sort(unique(as.character(entries)))
    paths <- if (length(entries)) {
        file.path(search_directory, entries)
    }
    else {
        character(0)
    }
    directories <- if (length(paths)) dir.exists(paths) else logical(0)
    labels <- if (length(entries)) {
        ifelse(directories, paste0(entries, "/"), entries)
    }
    else {
        character(0)
    }
    symbols <- if (length(labels)) {
        paste0(parts$directory, labels)
    }
    else {
        character(0)
    }
    items <- lapply(seq_along(symbols), function(index) {
        list(
            label = as.character(symbols[[index]]),
            kind = if (isTRUE(directories[[index]])) "folder" else "file"
        )
    })

    list(
        exports = character(0),
        internals = character(0),
        symbols = as.character(symbols),
        items = items
    )
}


completion_dollar_context <- function(code, cursor_column) {
    prefix <- completion_cursor_prefix(code, cursor_column)

    if (is.null(prefix)) return(NULL)

    match <- regexec(
        paste0(
            "([A-Za-z.][A-Za-z0-9._]*",
            "(?:[$][A-Za-z.][A-Za-z0-9._]*)*)",
            "[$]([A-Za-z0-9._]*)$"
        ),
        prefix,
        perl = TRUE
    )
    parts <- regmatches(prefix, match)[[1]]

    if (length(parts) < 3L) return(NULL)

    list(
        chain = as.character(parts[[2]] %||% ""),
        token = as.character(parts[[3]] %||% "")
    )
}


completion_stored_list_fields <- function(value, name, overridden_classes) {
    fields <- runtime_stored_list_fields(value, name)
    if (
        !isTRUE(fields$inspectable) ||
        any(is.element(fields$classes, overridden_classes)) ||
        is.element("default", overridden_classes)
    ) {
        return(list(names = character(0), value = NULL))
    }

    fields
}


completion_named_member <- function(value, name, overridden_classes) {
    completion_stored_list_fields(value, name, overridden_classes)$value
}


completion_resolve_chain <- function(chain, overridden_classes) {
    chain <- as.character(chain %||% "")

    if (!nzchar(chain)) return(NULL)

    parts <- strsplit(chain, "$", fixed = TRUE)[[1]]
    parts <- parts[nzchar(parts)]

    if (!length(parts)) return(NULL)
    binding <- runtime_binding_info(.GlobalEnv, parts[[1L]])
    if (!is.element(binding$state, c("value", "forced"))) {
        return(NULL)
    }

    value <- binding$value

    if (is.null(value) || length(parts) == 1L) return(value)

    for (index in seq.int(2L, length(parts))) {
        member <- as.character(parts[[index]] %||% "")

        if (!nzchar(member)) return(NULL)

        value <- completion_named_member(value, member, overridden_classes)

        if (is.null(value)) return(NULL)
    }

    value
}


completion_members <- function(value, overridden_classes) {
    completion_stored_list_fields(value, NULL, overridden_classes)$names
}


completion_dollar_result <- function(context) {
    context <- context %||% list()
    overridden_classes <- workspace_overridden_inspection_classes()
    value <- completion_resolve_chain(context$chain %||% "", overridden_classes)
    token <- as.character(context$token %||% "")
    members <- completion_members(value, overridden_classes)

    if (nzchar(token)) {
        members <- members[startsWith(members, token)]
    }

    list(
        exports = character(0),
        internals = character(0),
        symbols = as.character(members),
        items = list()
    )
}

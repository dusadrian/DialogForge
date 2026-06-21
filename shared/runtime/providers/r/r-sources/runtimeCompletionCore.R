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


completion_named_member <- function(value, name) {
    if (is.data.frame(value)) {
        members <- tryCatch(
            as.character(colnames(value) %||% character(0)),
            error = function(error) character(0)
        )
    }
    else if (is.list(value)) {
        members <- tryCatch(
            as.character(names(value) %||% character(0)),
            error = function(error) character(0)
        )
    }
    else {
        return(NULL)
    }

    if (!length(members) || !is.element(name, members)) return(NULL)

    tryCatch(value[[name]], error = function(error) NULL)
}


completion_resolve_chain <- function(chain) {
    chain <- as.character(chain %||% "")

    if (!nzchar(chain)) return(NULL)

    parts <- strsplit(chain, "$", fixed = TRUE)[[1]]
    parts <- parts[nzchar(parts)]

    if (!length(parts)) return(NULL)
    if (!exists(parts[[1]], envir = .GlobalEnv, inherits = FALSE)) {
        return(NULL)
    }

    value <- tryCatch(
        get(parts[[1]], envir = .GlobalEnv, inherits = FALSE),
        error = function(error) NULL
    )

    if (is.null(value) || length(parts) == 1L) return(value)

    for (index in seq.int(2L, length(parts))) {
        member <- as.character(parts[[index]] %||% "")

        if (!nzchar(member)) return(NULL)

        value <- completion_named_member(value, member)

        if (is.null(value)) return(NULL)
    }

    value
}


completion_members <- function(value) {
    if (is.data.frame(value)) {
        columns <- tryCatch(
            colnames(value),
            error = function(error) NULL
        )

        if (is.null(columns) || !length(columns)) {
            return(paste0("V", seq_len(max(1L, ncol(value)))))
        }

        return(as.character(columns))
    }

    if (is.list(value)) {
        return(as.character(
            tryCatch(names(value), error = function(error) NULL) %||%
                character(0)
        ))
    }

    character(0)
}


completion_dollar_result <- function(context) {
    context <- context %||% list()
    value <- completion_resolve_chain(context$chain %||% "")
    token <- as.character(context$token %||% "")
    members <- completion_members(value)

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

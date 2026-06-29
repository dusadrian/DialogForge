last_error <- ""


safe <- function(expression) {
    tryCatch(expression, error = function(error) {
        last_error <<- as.character(conditionMessage(error))
        NULL
    })
}


`%||%` <- function(value, fallback) {
    if (is.null(value)) fallback else value
}


meta_path <- as.character(opts$meta_path %||% "")
events_path <- as.character(opts$events_path %||% "")
trace_path <- as.character(opts$trace_path %||% "")
trace_enabled <- isTRUE(opts$trace_enabled)
session_kind <- as.character(opts$session_kind %||% "interactive")
token <- as.character(opts$token %||% "")
port <- as.integer(opts$port %||% 0L)
orig_profile <- as.character(opts$orig_profile %||% "")

plot_backend <- "none"
plot_device <- NA_integer_
plot_last_upid <- ""
plot_last_url <- ""
plot_last_count <- 0L
plot_last_signature <- ""


json_escape_code <- function(code) {
    if (is.na(code)) return("\\ufffd")
    if (code == 34L) return("\\\"")
    if (code == 92L) return("\\\\")
    if (code == 8L) return("\\b")
    if (code == 9L) return("\\t")
    if (code == 10L) return("\\n")
    if (code == 12L) return("\\f")
    if (code == 13L) return("\\r")
    if (code >= 0L && code < 32L) return(sprintf("\\u%04x", code))

    intToUtf8(code)
}


json_escape <- function(value) {
    text <- enc2utf8(as.character(value %||% ""))
    codes <- tryCatch(
        utf8ToInt(text),
        error = function(error) integer(0)
    )

    if (!length(codes)) return("")

    paste(
        vapply(codes, json_escape_code, character(1)),
        collapse = ""
    )
}


json_str <- function(value) {
    paste0('"', json_escape(value), '"')
}


json_bool <- function(value) {
    if (isTRUE(value)) "true" else "false"
}


json_strv <- function(values) {
    values <- as.character(values %||% character(0))

    if (!length(values)) return("[]")

    paste0(
        "[",
        paste(vapply(values, json_str, character(1)), collapse = ","),
        "]"
    )
}


json_boolv <- function(values) {
    values <- as.logical(values %||% logical(0))

    if (!length(values)) return("[]")

    paste0(
        "[",
        paste(vapply(values, json_bool, character(1)), collapse = ","),
        "]"
    )
}


json_dataframe_field <- function(entry, field_name) {
    values <- entry[[field_name]]

    if (!is.logical(values)) return("")

    paste0(json_str(field_name), ":", json_boolv(values))
}


json_dataframe_entry <- function(name, entry) {
    entry <- entry %||% list(colnames = character(0))
    fields <- names(entry) %||% character(0)
    extra_fields <- fields[fields != "colnames"]
    parts <- c(paste0(
        "\"colnames\":",
        json_strv(as.character(entry$colnames %||% character(0)))
    ))
    extras <- vapply(extra_fields, function(field_name) {
        json_dataframe_field(entry, field_name)
    }, character(1))
    extras <- extras[nzchar(extras)]

    if (length(extras)) {
        parts <- c(parts, extras)
    }

    paste0(json_str(name), ":{", paste(parts, collapse = ","), "}")
}


json_df <- function(dataframe_map) {
    entry_names <- names(dataframe_map)

    if (is.null(entry_names) || !length(entry_names)) return("{}")

    entries <- vapply(entry_names, function(name) {
        json_dataframe_entry(name, dataframe_map[[name]])
    }, character(1))

    paste0("{", paste(entries, collapse = ","), "}")
}


json_num <- function(value) {
    number <- suppressWarnings(as.numeric(value %||% 0))

    if (!is.finite(number) || is.na(number)) {
        number <- 0
    }

    if (abs(number - round(number)) < 1e-9) {
        return(sprintf("%.0f", number))
    }

    text <- format(
        number,
        scientific = FALSE,
        trim = TRUE,
        digits = 15
    )
    text <- sub("0+$", "", text)
    sub("\\.$", "", text)
}


r_ident <- function(name) {
    text <- as.character(name %||% "")

    if (!nzchar(text)) return("``")

    if (
        grepl("^[A-Za-z.][A-Za-z0-9._]*$", text) &&
        !grepl("^\\.[0-9]", text)
    ) {
        return(text)
    }

    paste0("`", gsub("`", "\\\\`", text, fixed = TRUE), "`")
}


json_variable <- function(variable) {
    paste0(
        "{\"access_key\":",
        json_str(as.character(variable$access_key %||% "")), ",",
        "\"display_name\":",
        json_str(as.character(variable$display_name %||% "")), ",",
        "\"display_value\":",
        json_str(as.character(variable$display_value %||% "")), ",",
        "\"display_type\":",
        json_str(as.character(variable$display_type %||% "")), ",",
        "\"type_info\":",
        json_str(as.character(variable$type_info %||% "")), ",",
        "\"size\":", json_num(variable$size %||% 0), ",",
        "\"kind\":",
        json_str(as.character(variable$kind %||% "other")), ",",
        "\"length\":", json_num(variable$length %||% 0), ",",
        "\"has_children\":", json_bool(variable$has_children), ",",
        "\"has_viewer\":", json_bool(variable$has_viewer), ",",
        "\"is_truncated\":", json_bool(variable$is_truncated), ",",
        "\"updated_time\":", json_num(variable$updated_time %||% 0),
        "}"
    )
}


json_variables <- function(variables) {
    if (is.null(variables) || !length(variables)) return("[]")

    paste0(
        "[",
        paste(vapply(variables, json_variable, character(1)), collapse = ","),
        "]"
    )
}

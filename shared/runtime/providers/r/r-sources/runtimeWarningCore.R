is_install_packages_code <- function(code) {
    code <- as.character(code %||% "")

    nzchar(code) && grepl(
        "(^|[^[:alnum:]_.])install\\.packages\\s*\\(",
        code,
        perl = TRUE
    )
}


should_suppress_warning <- function(text) {
    text <- as.character(text %||% "")

    if (!nzchar(text) || !identical(.Platform$OS.type, "windows")) {
        return(FALSE)
    }

    grepl(
        paste0(
            "^cannot open URL 'https?://.+/",
            "(?:src/contrib|bin/windows/contrib/[^/]+)/PACKAGES\\.rds': ",
            "HTTP status was '404 Not Found'$"
        ),
        text,
        perl = TRUE
    )
}


filter_warnings <- function(warnings, code = "") {
    warnings <- as.character(warnings %||% character(0))

    if (!length(warnings)) return(character(0))
    if (!is_install_packages_code(code)) return(warnings)

    warnings[!vapply(warnings, should_suppress_warning, logical(1))]
}


is_package_loading_warning <- function(text) {
    text <- as.character(text %||% "")

    grepl("^'package:[^']+' may not be available when loading$", text)
}


runtime_diagnostic_value <- function(expression) {
    tryCatch(
        expression,
        error = function(error) paste0("<error:", conditionMessage(error), ">")
    )
}


runtime_diagnostic_environment_name <- function(value) {
    environment <- if (is.function(value)) {
        environment(value)
    } else if (is.environment(value)) {
        value
    } else {
        NULL
    }

    if (is.null(environment)) return("")

    name <- runtime_diagnostic_value(environmentName(environment))

    if (nzchar(name)) return(name)

    runtime_diagnostic_value(
        utils::capture.output(print(environment))[[1]]
    )
}


runtime_diagnostic_object <- function(name) {
    value <- runtime_diagnostic_value(
        get(name, envir = .GlobalEnv, inherits = FALSE)
    )

    if (is.character(value) && grepl("^<error:", value)) {
        return(paste(name, value))
    }

    classes <- paste(class(value), collapse = "/")
    environment_name <- runtime_diagnostic_environment_name(value)
    result <- paste0(name, " class=", classes)

    if (nzchar(environment_name)) {
        result <- paste0(result, " env=", environment_name)
    }

    result
}


package_loading_warning_diagnostics <- function(code = "", warning_text = "") {
    global_names <- runtime_diagnostic_value(
        ls(envir = .GlobalEnv, all.names = TRUE)
    )
    object_lines <- runtime_diagnostic_value(
        vapply(global_names, runtime_diagnostic_object, character(1))
    )
    save_image_locations <- runtime_diagnostic_value(
        paste(find("save.image"), collapse = ", ")
    )
    save_image_environment <- runtime_diagnostic_value(
        environmentName(environment(get("save.image", inherits = TRUE)))
    )
    save_locations <- runtime_diagnostic_value(
        paste(find("save"), collapse = ", ")
    )

    paste(
        c(
            "[DialogForge R runtime diagnostic: package availability warning while saving/loading]",
            paste0("warning: ", as.character(warning_text %||% "")),
            paste0("code: ", as.character(code %||% "")),
            paste0("search: ", paste(search(), collapse = " | ")),
            paste0("find(save.image): ", save_image_locations),
            paste0("environment(save.image): ", save_image_environment),
            paste0("find(save): ", save_locations),
            paste0(".GlobalEnv names: ", paste(global_names, collapse = ", ")),
            ".GlobalEnv objects:",
            paste0("  ", object_lines)
        ),
        collapse = "\n"
    )
}


code_may_mutate_workspace <- function(code = "") {
    code <- as.character(code %||% "")

    if (!nzchar(trimws(code))) return(FALSE)

    patterns <- c(
        "(^|[^[:alnum:]_.])(<-|<<-)([^[:alnum:]_]|$)",
        "(^|[^[:alnum:]_.]):=([^[:alnum:]_]|$)",
        paste0(
            "(^|[^[:alnum:]_.])",
            "(assign|delayedAssign|rm|remove|load|source|sys\\.source|",
            "set|setattr|setnames|setcolorder|setorderv|setkey|setDT|",
            "unlockBinding|lockBinding)\\s*\\("
        ),
        paste0(
            "(^|[^[:alnum:]_.])",
            "(data|data\\.|read\\.[[:alnum:]_.]+|write\\.[[:alnum:]_.]+)",
            "\\s*\\("
        )
    )

    any(vapply(patterns, function(pattern) {
        grepl(pattern, code, perl = TRUE)
    }, logical(1)))
}


runtime_startup_capture <- function(expression, environment) {
    warnings <- character(0)
    messages <- character(0)
    output <- character(0)

    result <- tryCatch({
        connection <- textConnection("output", "w", local = TRUE)

        on.exit({
            try(sink(type = "output"), silent = TRUE)
            try(close(connection), silent = TRUE)
        }, add = TRUE)

        sink(connection, type = "output")
        value <- withCallingHandlers(
            eval(expression, envir = environment),
            message = function(message) {
                messages <<- c(messages, conditionMessage(message))
                tryInvokeRestart("muffleMessage")
            },
            warning = function(warning) {
                warnings <<- c(warnings, conditionMessage(warning))
                tryInvokeRestart("muffleWarning")
            }
        )

        list(ok = TRUE, value = value)
    }, error = function(error) {
        list(ok = FALSE, error = conditionMessage(error))
    })

    list(
        ok = isTRUE(result$ok),
        error = as.character(result$error %||% ""),
        output = as.character(output),
        messages = as.character(messages),
        warnings = as.character(warnings)
    )
}


runtime_emit_startup_warnings <- function(warnings) {
    warnings <- filter_warnings(warnings)

    if (!length(warnings)) return(invisible(NULL))

    text <- if (length(warnings) == 1L) {
        paste0("Warning message:\n", warnings[[1]])
    } else {
        paste0(
            "Warning messages:\n",
            paste0(seq_along(warnings), ": ", warnings, collapse = "\n")
        )
    }

    emit_stream_event(text, "warning")
}


emit_startup_output <- function(expression) {
    expression <- substitute(expression)
    captured <- runtime_startup_capture(expression, parent.frame())
    output <- paste(captured$output[nzchar(captured$output)], collapse = "\n")
    messages <- paste(captured$messages[nzchar(captured$messages)], collapse = "")

    if (nzchar(output)) {
        emit_stream_event(output, "stdout")
    }

    if (nzchar(messages)) {
        emit_stream_event(messages, "message")
    }

    runtime_emit_startup_warnings(captured$warnings)

    if (!captured$ok) {
        emit_stream_event(
            paste0("Error: ", captured$error %||% "startup failed"),
            "stderr"
        )

        return(invisible(FALSE))
    }

    invisible(TRUE)
}

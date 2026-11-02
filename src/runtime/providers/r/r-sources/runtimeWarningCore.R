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


runtime_accept_input_warning <- function(warning, code) {
    text <- conditionMessage(warning)
    level <- getOption("warn", 0)

    if (level < 0 || !length(filter_warnings(text, code))) {
        return(FALSE)
    }

    # signalCondition() alone has no default warning action to convert.
    if (level >= 2 && !is.null(findRestart("muffleWarning"))) {
        stop(simpleError(
            paste0("(converted from warning) ", text),
            call = conditionCall(warning)
        ))
    }

    TRUE
}


is_package_loading_warning <- function(text) {
    text <- as.character(text %||% "")

    grepl("^'package:[^']+' may not be available when loading$", text)
}


runtime_message_output_namespace <- function() {
    library <- Sys.getenv("DIALOGFORGE_OUTPUT_LIBRARY", unset = "")
    if (!nzchar(library)) {
        library <- get0(
            "runtime_inspection_library", envir = environment(),
            inherits = TRUE, ifnotfound = ""
        )
    }
    namespace <- loadNamespace(
        "dialogforgeruntime", lib.loc = if (nzchar(library)) library else NULL
    )
    if (
        !identical(as.character(getNamespaceVersion(namespace)), "0.1.3") ||
        !exists("open_message_output", envir = namespace, inherits = FALSE)
    ) {
        stop("DialogForge message-output helper version mismatch; rebuild it.")
    }
    namespace
}


runtime_create_message_output <- function(output_connection, error_connection) {
    scopes <- list()

    retain_active_scopes <- function(restarts) {
        active <- list()
        for (scope in scopes) {
            for (restart in restarts) {
                if (identical(scope$exit, restart$exit)) {
                    active[[length(active) + 1L]] <- scope
                    break
                }
            }
        }
        scopes <<- active
        invisible(NULL)
    }

    observe_scope <- function(name, message_output) {
        restart <- base::findRestart(name)
        if (is.null(restart) || is.null(restart$exit)) {
            return(invisible(NULL))
        }
        retain_active_scopes(base::computeRestarts())
        scopes[[length(scopes) + 1L]] <<- list(
            exit = restart$exit, message_output = message_output
        )
        invisible(NULL)
    }

    select_output <- function() {
        restarts <- base::computeRestarts()
        retain_active_scopes(restarts)
        for (restart in restarts) {
            for (scope in base::rev(scopes)) {
                if (identical(restart$exit, scope$exit)) {
                    return(scope$message_output)
                }
            }
        }
        FALSE
    }

    namespace <- runtime_message_output_namespace()
    list(
        connection = namespace$open_message_output(
            output_connection, error_connection, select_output
        ),
        observe_message = function(condition) {
            observe_scope("muffleMessage", TRUE)
        },
        observe_warning = function(condition) {
            observe_scope("muffleWarning", FALSE)
        }
    )
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


runtime_startup_capture <- function(expression, environment) {
    warnings <- character(0)
    messages <- character(0)
    output <- character(0)
    original_message_number <- sink.number(type = "message")
    original_message_connection <- getConnection(original_message_number)
    message_connection <- NULL
    error_connection <- NULL
    message_output <- NULL

    result <- tryCatch({
        connection <- textConnection("output", "w", local = TRUE)

        on.exit({
            if (original_message_number == 2L) {
                try(sink(type = "message"), silent = TRUE)
            }
            else {
                try(sink(original_message_connection, type = "message"), silent = TRUE)
            }
            try(sink(type = "output"), silent = TRUE)
            if (!is.null(message_output)) {
                try(close(message_output$connection), silent = TRUE)
            }
            if (!is.null(message_connection)) {
                try(close(message_connection), silent = TRUE)
            }
            if (!is.null(error_connection)) {
                try(close(error_connection), silent = TRUE)
            }
            try(close(connection), silent = TRUE)
        }, add = TRUE)

        sink(connection, type = "output")
        message_connection <- rawConnection(raw(), "w")
        error_connection <- rawConnection(raw(), "w")
        message_output <- runtime_create_message_output(
            message_connection, error_connection
        )
        sink(message_output$connection, type = "message")
        value <- withCallingHandlers(
            eval(expression, envir = environment),
            message = message_output$observe_message,
            warning = function(warning) {
                warnings <<- c(warnings, conditionMessage(warning))
                tryInvokeRestart("muffleWarning")
            }
        )

        list(ok = TRUE, value = value)
    }, error = function(error) {
        list(ok = FALSE, error = conditionMessage(error))
    })

    if (!is.null(message_connection)) {
        messages <- rawToChar(rawConnectionValue(message_connection))
    }
    if (!is.null(error_connection)) {
        errors <- rawToChar(rawConnectionValue(error_connection))
        sink(original_message_connection, type = "message")
        if (nzchar(errors)) {
            cat(errors, file = stderr(), sep = "")
        }
    }

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

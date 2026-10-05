remove_runtime_global_bindings <- function() {
    for (name in c(".app_runtime_control_status")) {
        if (exists(name, envir = .GlobalEnv, inherits = FALSE)) {
            safe(rm(list = name, envir = .GlobalEnv))
        }
    }

    invisible(NULL)
}


app_env$traceback <- function(
    x = NULL,
    max.lines = getOption("traceback.max.lines", getOption("deparse.max.lines", -1L))
) {
    if (!is.null(x)) {
        return(base::traceback(x = x, max.lines = max.lines))
    }

    calls <- app_env$dialog_last_traceback

    if (is.null(calls) || !length(calls)) {
        return(base::traceback(x = NULL, max.lines = max.lines))
    }

    base::traceback(x = calls, max.lines = max.lines)
}


runtime_search_binding <- function(value) {
    if (missing(value)) {
        return(base::get(binding_name, envir = runtime_owner, inherits = FALSE))
    }

    base::assign(binding_name, value, envir = runtime_owner)
    invisible(value)
}


install_runtime_search_bindings <- function(search_environment) {
    if (identical(search_environment, app_env)) {
        return(invisible(TRUE))
    }

    # attach(environment) copies bindings. Keep the original state owner and
    # expose forwarding bindings instead, without reading any runtime values.
    for (name in ls(envir = app_env, all.names = TRUE)) {
        if (exists(name, envir = search_environment, inherits = FALSE)) {
            next
        }

        binding_environment <- new.env(parent = baseenv())
        binding_environment$binding_name <- name
        binding_environment$runtime_owner <- app_env
        binding <- runtime_search_binding
        if (isTRUE(runtime_control_closure_is_compiled(binding))) {
            binding <- runtime_rebind_compiled_control_closure(
                binding, binding_environment, binding
            )
        }
        else {
            environment(binding) <- binding_environment
        }
        makeActiveBinding(name, binding, search_environment)
    }

    invisible(TRUE)
}


ensure_dialog_app_search_position <- function() {
    if (length(search()) < 2L || !identical(search()[[2L]], "DialogApp")) {
        if (is.element("DialogApp", search())) {
            detach("DialogApp", character.only = TRUE)
        }
        attach(NULL, name = "DialogApp", pos = 2L, warn.conflicts = FALSE)
    }

    install_runtime_search_bindings(as.environment("DialogApp"))

    invisible(TRUE)
}


runtime_console_pager <- function(
    files,
    header = rep("", length(files)),
    title = "R Information",
    delete.file = FALSE
) {
    files <- path.expand(as.character(files))
    headers <- rep_len(as.character(header), length(files))

    if (isTRUE(delete.file)) {
        on.exit(unlink(files), add = TRUE)
    }

    for (index in seq_along(files)) {
        if (index > 1L) {
            writeLines("")
        }

        if (nzchar(headers[[index]])) {
            writeLines(headers[[index]])
        }

        if (file.exists(files[[index]])) {
            writeLines(readLines(files[[index]], warn = FALSE))
        }
    }

    invisible(title)
}


install_runtime_console_bindings <- function() {
    app_env$plot <- graphics::plot
    ensure_dialog_app_search_position()
    options(pager = runtime_console_pager)
    install_runtime_help_browser()

    invisible(TRUE)
}


remove_runtime_global_bindings()
install_runtime_console_bindings()
install_prompt_hooks()

runtime_replace_function <- function(name, environment, replacement) {
    if (!exists(name, envir = environment, inherits = FALSE)) {
        return(invisible(FALSE))
    }

    locked <- tryCatch(
        isTRUE(bindingIsLocked(name, environment)),
        error = function(error) FALSE
    )

    if (locked) {
        safe(unlockBinding(name, environment))
    }

    on.exit({
        if (locked) {
            safe(lockBinding(name, environment))
        }
    }, add = TRUE)

    assign(name, replacement, envir = environment)

    invisible(TRUE)
}


runtime_prompt_pending_reply <- function(parent_id) {
    pending <- pending_prompt_reply

    if (is.null(pending)) return(NULL)

    reply_parent <- as.character(pending$parent_id %||% "")

    if (nzchar(reply_parent) && !identical(reply_parent, parent_id)) {
        return(NULL)
    }

    reply <- as.character(pending$reply %||% "")
    pending_prompt_reply <<- NULL

    reply
}


wait_for_prompt_reply <- function(prompt = "", password = FALSE) {
    parent_id <- as.character(current_activity_id %||% "")

    trace(paste0("prompt:wait-start parent=", parent_id))
    emit_prompt_event(
        as.character(prompt %||% ""),
        isTRUE(password),
        parent_id
    )

    repeat {
        reply <- runtime_prompt_pending_reply(parent_id)

        if (!is.null(reply)) {
            trace(paste0("prompt:reply parent=", parent_id))
            return(reply)
        }

        safe(process_once())
        Sys.sleep(0.02)
    }
}


emit_menu_choices <- function(choices, title = NULL) {
    choices <- as.character(choices %||% character(0))
    title <- as.character(title %||% "")
    lines <- character(0)

    if (nzchar(title)) {
        lines <- c(lines, title)
    }

    if (length(choices)) {
        lines <- c(lines, paste0(seq_along(choices), ": ", choices))
    }

    text <- paste(lines, collapse = "\n")

    if (nzchar(text)) {
        emit_stream_event(text, "stdout")
    }

    invisible(NULL)
}


runtime_menu_selection <- function(choices) {
    repeat {
        reply <- trimws(wait_for_prompt_reply("Selection: ", FALSE))
        selection <- suppressWarnings(as.integer(reply))

        if (
            length(selection) == 1L &&
            !is.na(selection) &&
            selection >= 0L &&
            selection <= length(choices)
        ) {
            return(selection)
        }

        if (length(choices)) {
            emit_stream_event(
                paste0(
                    "Enter a number between 1 and ",
                    length(choices),
                    ", or enter 0 to exit."
                ),
                "stdout"
            )
        }
    }
}


runtime_install_readline_hook <- function() {
    replacement <- function(prompt = "") {
        wait_for_prompt_reply(as.character(prompt %||% ""), FALSE)
    }

    installed <- isTRUE(safe(runtime_replace_function(
        "readline",
        baseenv(),
        replacement
    )))

    if (!installed) {
        installed <- isTRUE(safe({
            assign("readline", replacement, envir = .GlobalEnv)
            TRUE
        }))
    }

    installed
}


runtime_install_menu_hook <- function() {
    replacement <- function(choices, graphics = FALSE, title = NULL) {
        choices <- as.character(choices %||% character(0))
        emit_menu_choices(choices, title)
        runtime_menu_selection(choices)
    }

    installed <- isTRUE(safe(runtime_replace_function(
        "menu",
        asNamespace("utils"),
        replacement
    )))

    if (!installed) {
        installed <- isTRUE(safe({
            assign("menu", replacement, envir = .GlobalEnv)
            TRUE
        }))
    }

    installed
}


runtime_install_askpass_hook <- function() {
    if (!isTRUE(safe(requireNamespace("askpass", quietly = TRUE)))) {
        return(FALSE)
    }

    isTRUE(safe(runtime_replace_function(
        "askpass",
        asNamespace("askpass"),
        function(prompt = "Please enter your password: ", ...) {
            wait_for_prompt_reply(
                as.character(prompt %||% "Please enter your password: "),
                TRUE
            )
        }
    )))
}


install_prompt_hooks <- function() {
    if (exists(
        ".app_runtime_prompt_hooks",
        envir = .GlobalEnv,
        inherits = FALSE
    )) {
        return(invisible(TRUE))
    }

    readline_installed <- runtime_install_readline_hook()
    menu_installed <- runtime_install_menu_hook()
    askpass_installed <- runtime_install_askpass_hook()

    safe(setHook(
        packageEvent("askpass", "onLoad"),
        function(...) {
            runtime_install_askpass_hook()
        },
        action = "append"
    ))

    installed <- readline_installed || menu_installed || askpass_installed

    if (installed) {
        assign(".app_runtime_prompt_hooks", TRUE, envir = .GlobalEnv)
    }

    trace(paste0(
        "promptHooks:readline=", readline_installed,
        " menu=", menu_installed,
        " askpass=", askpass_installed
    ))

    invisible(installed)
}

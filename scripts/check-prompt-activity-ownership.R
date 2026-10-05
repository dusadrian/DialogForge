args <- commandArgs(trailingOnly = FALSE)
script <- sub("^--file=", "", args[startsWith(args, "--file=")][[1L]])
root <- dirname(dirname(normalizePath(script)))
expressions <- parse(file = file.path(
    root, "src/runtime/providers/r/r-sources/runtimeDispatchCore.R"
))
fixture <- new.env(parent = baseenv())
fixture$`%||%` <- function(value, fallback) {
    if (is.null(value)) fallback else value
}

for (expression in expressions) {
    if (
        is.call(expression) &&
        identical(expression[[1L]], as.name("<-")) &&
        identical(expression[[2L]], as.name("runtime_reply_prompt"))
    ) {
        eval(expression, envir = fixture)
    }
}

fixture$current_activity_id <- "active"
fixture$active_prompt_id <- "first-prompt"
fixture$pending_prompt_reply <- NULL
stopifnot(!fixture$runtime_reply_prompt(list(parentId = "retired", reply = "yes"))$ok)
stopifnot(is.null(fixture$pending_prompt_reply))
stopifnot(!fixture$runtime_reply_prompt(list(reply = "yes"))$ok)
stopifnot(!fixture$runtime_reply_prompt(list(
    parentId = "active", promptId = "first-prompt"
))$ok)
stopifnot(!fixture$runtime_reply_prompt(list(parentId = "active", reply = ""))$ok)
stopifnot(fixture$runtime_reply_prompt(list(
    parentId = "active", promptId = "first-prompt", reply = ""
))$ok)
stopifnot(identical(fixture$pending_prompt_reply$reply, ""))
stopifnot(!fixture$runtime_reply_prompt(list(
    parentId = "active", promptId = "first-prompt", reply = "duplicate"
))$ok)
stopifnot(identical(fixture$pending_prompt_reply$reply, ""))
fixture$pending_prompt_reply <- NULL
fixture$active_prompt_id <- "second-prompt"
stopifnot(!fixture$runtime_reply_prompt(list(
    parentId = "active", promptId = "first-prompt", reply = "late"
))$ok)
stopifnot(is.null(fixture$pending_prompt_reply))
stopifnot(fixture$runtime_reply_prompt(list(
    parentId = "active", promptId = "second-prompt", reply = "current"
))$ok)
fixture$current_activity_id <- "replacement"
stopifnot(!fixture$runtime_reply_prompt(list(parentId = "active", reply = "late"))$ok)
stopifnot(identical(fixture$pending_prompt_reply$reply, "current"))
fixture$current_activity_id <- ""
stopifnot(!fixture$runtime_reply_prompt(list(parentId = "replacement", reply = "late"))$ok)
for (expression in parse(file = file.path(
    root, "src/runtime/providers/r/r-sources/runtimePromptCore.R"
))) {
    if (
        is.call(expression) &&
        identical(expression[[1L]], as.name("<-")) &&
        identical(expression[[2L]], as.name("runtime_install_menu_hook"))
    ) {
        eval(expression, envir = fixture)
    }
}

installed_bindings <- list()
fixture$safe <- function(value) value
fixture$runtime_replace_function <- function(name, environment, replacement) {
    installed_bindings[[length(installed_bindings) + 1L]] <<- list(
        name = name, environment = environment, replacement = replacement
    )
    TRUE
}
stopifnot(fixture$runtime_install_menu_hook())
stopifnot(identical(installed_bindings[[1L]]$name, "menu"))
stopifnot(identical(installed_bindings[[1L]]$environment, asNamespace("utils")))
if (is.element("package:utils", search())) {
    stopifnot(length(installed_bindings) == 2L)
    stopifnot(identical(
        installed_bindings[[2L]]$environment, as.environment("package:utils")
    ))
    stopifnot(identical(
        installed_bindings[[1L]]$replacement, installed_bindings[[2L]]$replacement
    ))
}
cat("Prompt ownership: activity/instance identity, duplicates, empty replies and shared menu bindings.\n")

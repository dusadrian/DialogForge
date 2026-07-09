dialog_required_packages <- c("digest", "utils")


dialog_package_available <- function(package) {
    isTRUE(tryCatch(
        requireNamespace(package, quietly = TRUE),
        error = function(error) FALSE
    ))
}


dialog_json_escape <- function(value) {
    gsub('"', '\\"', as.character(value), fixed = TRUE)
}


dialog_emit_dependency_error <- function(missing_packages) {
    cat(
        paste0(
            "{\"type\":\"init\",",
            "\"status\":\"error\",",
            "\"missing\":[",
            paste(
                sprintf(
                    "\"%s\"",
                    vapply(
                        missing_packages,
                        dialog_json_escape,
                        character(1)
                    )
                ),
                collapse = ","
            ),
            "]}\n"
        ),
        sep = ""
    )
}


dialog_backend_directory <- function() {
    directory <- tryCatch(
        dirname(normalizePath(sys.frames()[[1]]$ofile)),
        error = function(error) ""
    )

    if (
        !is.null(directory) &&
        nzchar(trimws(directory)) &&
        file.exists(file.path(directory, "backend.R"))
    ) {
        return(directory)
    }

    working_directory <- getwd()
    candidates <- c(
        file.path(working_directory, "src", "library", "R"),
        working_directory
    )

    for (candidate in candidates) {
        if (file.exists(file.path(candidate, "backend.R"))) {
            return(candidate)
        }
    }

    ""
}


dialog_emit_backend_error <- function(error) {
    cat(
        paste0(
            "{\"type\":\"init\",",
            "\"status\":\"error\",",
            "\"message\":\"Failed to source backend.R: ",
            dialog_json_escape(conditionMessage(error)),
            "\"}\n"
        ),
        sep = ""
    )
}


dialog_initialize_backend <- function() {
    directory <- dialog_backend_directory()
    source_error <- NULL

    tryCatch(
        source(file.path(directory, "backend.R")),
        error = function(error) {
            source_error <<- error
        }
    )

    if (!is.null(source_error)) {
        dialog_emit_backend_error(source_error)
        return(invisible(FALSE))
    }

    tryCatch(dialog_init(), error = function(error) NULL)
    dialog_emit(list(
        type = "init",
        status = "ok",
        protocol = "dm-json-v1"
    ))
    invisible(TRUE)
}


missing_packages <- dialog_required_packages[
    !vapply(
        dialog_required_packages,
        dialog_package_available,
        logical(1)
    )
]

if (length(missing_packages)) {
    dialog_emit_dependency_error(missing_packages)
}
else {
    dialog_initialize_backend()
}

rm(dialog_required_packages, missing_packages)
flush(stdout())
invisible(NULL)

# Exercise the real installation script with disposable files and simulated
# platform/environment inputs. No fixture binary is executed or loaded.
local({
    arguments <- commandArgs(trailingOnly = FALSE)
    script <- sub("^--file=", "", arguments[startsWith(arguments, "--file=")][[1L]])
    root <- dirname(dirname(normalizePath(script)))
    sources <- file.path(root, "src/runtime/providers/r/native/dialogforgeruntime/src")
    installer <- file.path(sources, "install.libs.R")

    makevars <- readLines(file.path(sources, "Makevars.win"), warn = FALSE)
    makevars <- gsub("\\\\\n[[:space:]]*", " ", paste(makevars, collapse = "\n"))
    object_line <- regmatches(makevars, regexpr("(?m)^OBJECTS[[:space:]]*=[^\n]*", makevars, perl = TRUE))
    objects <- strsplit(trimws(sub("^OBJECTS[[:space:]]*=", "", object_line)), "[[:space:]]+")[[1L]]
    native_sources <- list.files(sources, pattern = "[.]c$")
    native_sources <- native_sources[native_sources != "windows-console-host.c"]
    expected_objects <- sub("[.]c$", ".o", native_sources)
    stopifnot(identical(sort(objects), sort(expected_objects)))

    check_installation <- function(name, platform, files, missing = NULL) {
        directory <- tempfile(paste0("dialogforge-install-", name, "-"))
        dir.create(directory)
        previous_directory <- setwd(directory)
        on.exit({
            setwd(previous_directory)
            unlink(directory, recursive = TRUE)
        }, add = TRUE)

        for (file in files) {
            writeLines(paste("Fixture payload for", file), file)
        }

        package_directory <- file.path(directory, "installed-package")
        fixture <- new.env(parent = baseenv())
        fixture$.Platform <- platform
        fixture$Sys.getenv <- function(name) {
            switch(name,
                R_PACKAGE_DIR = package_directory,
                R_ARCH = if (identical(platform$OS.type, "windows")) "x64" else "",
                stop("Unexpected installation environment input: ", name)
            )
        }
        result <- tryCatch({
            sys.source(installer, envir = fixture)
            NULL
        }, error = identity)
        destination <- file.path(
            package_directory,
            "libs",
            if (identical(platform$OS.type, "windows")) "x64" else ""
        )

        if (!is.null(missing)) {
            stopifnot(
                inherits(result, "error"),
                grepl("Missing required DialogForge runtime helper payload", conditionMessage(result), fixed = TRUE),
                grepl(missing, conditionMessage(result), fixed = TRUE),
                length(list.files(destination)) == 0L
            )
            return(invisible(NULL))
        }

        if (inherits(result, "error")) {
            stop(result)
        }

        stopifnot(identical(sort(list.files(destination)), sort(files)))

        for (file in files) {
            stopifnot(identical(
                readLines(file.path(destination, file)),
                readLines(file)
            ))
        }
    }

    windows <- list(OS.type = "windows", dynlib.ext = ".dll")
    unix <- list(OS.type = "unix", dynlib.ext = ".so")
    check_installation(
        "windows-host-only", windows, "dialogforge-r-host.exe",
        missing = "dialogforgeruntime.dll"
    )
    check_installation(
        "windows-unrelated-dll", windows, c("unrelated.dll", "dialogforge-r-host.exe"),
        missing = "dialogforgeruntime.dll"
    )
    check_installation(
        "windows-dll-only", windows, "dialogforgeruntime.dll",
        missing = "dialogforge-r-host.exe"
    )
    check_installation(
        "windows-complete", windows, c("dialogforgeruntime.dll", "dialogforge-r-host.exe")
    )
    check_installation("unix-missing-helper", unix, "unrelated.so", missing = "dialogforgeruntime.so")
    check_installation("unix-complete", unix, "dialogforgeruntime.so")

    cat("Native helper object coverage and required installation payload cases passed.\n")
})

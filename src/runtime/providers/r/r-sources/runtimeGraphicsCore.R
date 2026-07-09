runtime_graphics_system_name <- function() {
    tryCatch(
        as.character(Sys.info()[["sysname"]] %||% ""),
        error = function(error) ""
    )
}


runtime_use_native_device <- function(device, name) {
    options(device = device)
    plot_backend <<- "native"
    trace(paste0("graphicsDevice:", name))

    invisible(TRUE)
}


open_native_graphics_device <- function() {
    system_name <- runtime_graphics_system_name()
    gr_devices <- asNamespace("grDevices")

    if (identical(system_name, "Darwin") && isTRUE(capabilities("aqua"))) {
        return(runtime_use_native_device(grDevices::quartz, "quartz"))
    }

    if (
        identical(.Platform$OS.type, "windows") &&
        exists("windows", envir = gr_devices, inherits = FALSE)
    ) {
        return(runtime_use_native_device(
            get("windows", envir = gr_devices, inherits = FALSE),
            "windows"
        ))
    }

    if (
        !identical(system_name, "Darwin") &&
        isTRUE(capabilities("X11")) &&
        exists("X11", envir = gr_devices, inherits = FALSE)
    ) {
        return(runtime_use_native_device(
            get("X11", envir = gr_devices, inherits = FALSE),
            "X11"
        ))
    }

    invisible(FALSE)
}


httpgd_plot_state <- function(which = NULL) {
    if (!requireNamespace("httpgd", quietly = TRUE)) return(NULL)

    which <- suppressWarnings(as.integer(
        which %||% plot_device %||% NA_integer_
    ))

    details <- tryCatch({
        if (is.finite(which) && !is.na(which) && which > 1L) {
            httpgd::hgd_details(which)
        } else {
            httpgd::hgd_details()
        }
    }, error = function(error) NULL)

    if (is.null(details) || !length(details)) return(NULL)

    details
}


plot_signature <- function() {
    plot <- tryCatch(
        serialize(grDevices::recordPlot(), NULL),
        error = function(error) raw(0)
    )

    if (!length(plot)) return("")

    values <- as.integer(plot)
    weighted <- sum((seq_along(values) %% 8191L) * values)

    paste(length(values), sum(values), weighted, sep = ":")
}


runtime_httpgd_url <- function() {
    tryCatch({
        arguments <- list(
            "live",
            host = "127.0.0.1",
            websockets = TRUE,
            sidebar = 1
        )

        if (is.finite(plot_device) && !is.na(plot_device)) {
            arguments$which <- plot_device
        }

        do.call(httpgd::hgd_url, arguments)
    }, error = function(error) "")
}


sync_httpgd_plot <- function(parent_id = "", previous_signature = "") {
    if (!identical(plot_backend, "httpgd")) return(invisible(FALSE))

    signature <- plot_signature()

    if (!nzchar(signature)) return(invisible(FALSE))

    previous_signature <- as.character(
        previous_signature %||% plot_last_signature %||% ""
    )

    if (
        nzchar(previous_signature) &&
        identical(signature, previous_signature)
    ) {
        return(invisible(FALSE))
    }

    if (is.null(httpgd_plot_state())) return(invisible(FALSE))

    url <- runtime_httpgd_url()

    if (!nzchar(url)) return(invisible(FALSE))

    plot_last_count <<- as.integer(plot_last_count %||% 0L) + 1L
    plot_last_upid <<- signature
    plot_last_url <<- url
    plot_last_signature <<- signature

    emit_plot_event(
        status = "available",
        url = url,
        viewer_url = url,
        parent_id = parent_id,
        count = plot_last_count,
        upid = signature
    )

    invisible(TRUE)
}


runtime_start_httpgd_device <- function() {
    tryCatch({
        httpgd::hgd(silent = TRUE)
        TRUE
    }, error = function(error) error)
}


runtime_httpgd_device_factory <- function(...) {
    started <- runtime_start_httpgd_device()

    if (!isTRUE(started)) {
        stop("httpgd device could not be created")
    }

    plot_device <<- suppressWarnings(as.integer(grDevices::dev.cur()))

    invisible(grDevices::dev.cur())
}


init_httpgd <- function() {
    if (!identical(session_kind, "dedicated")) return(invisible(FALSE))

    if (!isTRUE(safe(requireNamespace("httpgd", quietly = TRUE)))) {
        return(invisible(FALSE))
    }

    started <- runtime_start_httpgd_device()

    if (!isTRUE(started)) {
        message <- if (inherits(started, "error")) {
            as.character(conditionMessage(started))
        } else {
            "unknown"
        }

        trace(paste0("graphicsDevice:httpgd:error=", message))

        return(invisible(FALSE))
    }

    plot_backend <<- "httpgd"
    plot_device <<- suppressWarnings(as.integer(grDevices::dev.cur()))
    options(device = runtime_httpgd_device_factory)
    trace("graphicsDevice:httpgd")

    invisible(TRUE)
}


configure_graphics_device <- function() {
    if (!identical(session_kind, "dedicated")) return(invisible(FALSE))

    current_device <- tryCatch(
        getOption("device"),
        error = function(error) NULL
    )

    if (!identical(current_device, grDevices::pdf)) {
        return(invisible(FALSE))
    }

    if (isTRUE(init_httpgd())) return(invisible(TRUE))

    invisible(isTRUE(open_native_graphics_device()))
}

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
    if (!base::requireNamespace("httpgd", quietly = TRUE)) return(NULL)

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


runtime_read_plot_transport <- function() {
    if (!is.null(runtime_graphics_transport)) {
        return(runtime_graphics_transport$read())
    }

    if (!identical(plot_backend, "httpgd")) {
        return(NULL)
    }

    if (is.null(httpgd_plot_state())) {
        return(NULL)
    }

    url <- runtime_httpgd_url()
    if (!nzchar(url)) {
        return(NULL)
    }

    state <- tryCatch(
        {
            devices <- grDevices::dev.list()
            device <- devices[match(plot_device, as.integer(devices))]
            unigd::ugd_state(which = device)
        },
        error = function(error) NULL
    )
    if (is.null(state)) {
        return(NULL)
    }

    list(url = url, viewer_url = url, count = state$hsize)
}


runtime_register_graphics_device <- function() {
    current <- grDevices::dev.cur()
    device <- as.integer(current)
    runtime_graphics_device_generation <<- runtime_graphics_device_generation + 1L
    runtime_graphics_devices[[as.character(device)]] <<- list(
        name = names(current), generation = runtime_graphics_device_generation,
        observation = runtime_observe_graphics_device(device)
    )
    plot_device <<- device

    invisible(device)
}


runtime_select_graphics_device <- function() {
    devices <- grDevices::dev.list()
    open_devices <- as.character(devices)
    for (key in names(runtime_graphics_devices)) {
        index <- match(key, open_devices)
        if (
            is.na(index) ||
            !identical(names(devices)[index], runtime_graphics_devices[[key]]$name) ||
            !isTRUE(runtime_graphics_device_is_current(
                runtime_graphics_devices[[key]]$observation, as.integer(key)
            ))
        ) {
            runtime_graphics_devices[[key]] <<- NULL
        }
    }

    device <- as.integer(grDevices::dev.cur())
    registered <- runtime_graphics_devices[[as.character(device)]]
    if (is.null(registered)) {
        return(NULL)
    }

    plot_device <<- device

    registered$generation
}


sync_runtime_plot <- function(parent_id = "", previous_signature = "") {
    if (
        !identical(plot_backend, "httpgd") &&
        is.null(runtime_graphics_transport)
    ) {
        return(invisible(FALSE))
    }

    generation <- runtime_select_graphics_device()
    if (!is.null(runtime_graphics_transport$prepare)) {
        runtime_graphics_transport$prepare()
    }

    if (is.null(generation)) {
        return(invisible(FALSE))
    }
    device_changed <- !identical(generation, plot_last_device_generation)
    signature <- plot_signature()

    if (!nzchar(signature)) return(invisible(FALSE))

    previous_signature <- as.character(
        previous_signature %||% plot_last_signature %||% ""
    )

    transport <- runtime_read_plot_transport()
    if (is.null(transport)) {
        return(invisible(FALSE))
    }

    count <- suppressWarnings(as.integer(transport$count))
    if (length(count) != 1L || is.na(count) || count < 1L) {
        return(invisible(FALSE))
    }

    page_changed <- !identical(count, as.integer(plot_last_count))
    if (
        !device_changed && !page_changed &&
        (
            identical(signature, plot_last_signature) ||
            (
                nzchar(previous_signature) &&
                identical(signature, previous_signature)
            )
        )
    ) {
        return(invisible(FALSE))
    }

    previous_count <- if (device_changed) {
        0L
    } else {
        as.integer(plot_last_count %||% 0L)
    }
    transport$first_page <- if (count > previous_count) {
        previous_count + 1L
    } else {
        count
    }

    if (
        !is.null(runtime_graphics_transport) &&
        !isTRUE(runtime_graphics_transport$publish(transport))
    ) {
        return(invisible(FALSE))
    }

    url <- as.character(transport$url %||% "")
    viewer_url <- as.character(transport$viewer_url %||% url)

    plot_last_count <<- count
    plot_last_device_generation <<- generation
    plot_last_upid <<- paste(generation, count, signature, sep = ":")
    plot_last_url <<- url
    plot_last_signature <<- signature

    emit_plot_event(
        status = "available",
        url = url,
        viewer_url = viewer_url,
        parent_id = parent_id,
        count = plot_last_count,
        upid = plot_last_upid
    )

    invisible(TRUE)
}


runtime_worker_canvas_device <- function(...) {
    cache_ids <- webr::canvas(width = 720, height = 576, capture = TRUE)
    runtime_register_graphics_device()
    key <- as.character(plot_device)
    previous <- runtime_worker_canvas_devices[[key]]
    if (!is.null(previous)) {
        webr::canvas_destroy(previous$read())
    }
    runtime_worker_canvas_devices[[key]] <<- list(
        read = cache_ids,
        observation = runtime_graphics_devices[[key]]$observation
    )
    grDevices::dev.control(displaylist = "enable")

    invisible(grDevices::dev.cur())
}


runtime_cleanup_worker_canvas <- function() {
    for (key in names(runtime_worker_canvas_devices)) {
        device <- runtime_worker_canvas_devices[[key]]
        if (!isTRUE(runtime_graphics_device_is_open(device$observation, as.integer(key)))) {
            webr::canvas_destroy(device$read())
            runtime_worker_canvas_devices[[key]] <<- NULL
        }
    }

    invisible(TRUE)
}


runtime_read_worker_canvas <- function() {
    if (!identical(as.integer(grDevices::dev.cur()), as.integer(plot_device))) {
        return(NULL)
    }

    cache_reader <- runtime_worker_canvas_devices[[as.character(plot_device)]]
    if (is.null(cache_reader)) {
        return(NULL)
    }
    cache_ids <- cache_reader$read()
    if (!length(cache_ids)) {
        return(NULL)
    }

    list(
        url = "", viewer_url = "", count = length(cache_ids),
        canvas_ids = cache_ids
    )
}


runtime_publish_worker_canvas <- function(transport) {
    # Copy the physical bitmap. Transferring the device's backing canvas would
    # clear it and lose drawing accumulated across subsequent R commands.
    cache_ids <- transport$canvas_ids
    pages <- seq.int(transport$first_page, transport$count)
    webr::eval_js(paste0(
        "(() => {",
        " const ids = ", jsonlite::toJSON(as.integer(cache_ids[pages])), ";",
        " const images = ids.map(id => {",
        " const source = globalThis.Module.webr.canvas[id].offscreen;",
        " const copy = new OffscreenCanvas(source.width, source.height);",
        " copy.getContext('2d').drawImage(source, 0, 0);",
        " return copy.transferToImageBitmap(); });",
        " globalThis.Module.webr.channel.write({",
        " type: 'dialogforge-graphics', count: ", transport$count,
        ", data: images }, images);",
        " return null;",
        " })()"
    ))

    # Open devices retain their pages for later dev.set() selection. The
    # device cleanup releases their canvases once those devices are closed.

    invisible(TRUE)
}


runtime_install_worker_graphics_transport <- function() {
    runtime_graphics_transport <<- list(
        prepare = runtime_cleanup_worker_canvas,
        read = runtime_read_worker_canvas,
        publish = runtime_publish_worker_canvas
    )
    plot_backend <<- "canvas"
    options(device = runtime_worker_canvas_device)

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

    runtime_register_graphics_device()

    invisible(grDevices::dev.cur())
}


init_httpgd <- function() {
    if (!identical(session_kind, "dedicated")) return(invisible(FALSE))

    if (!isTRUE(safe(base::requireNamespace("httpgd", quietly = TRUE)))) {
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
    runtime_register_graphics_device()
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

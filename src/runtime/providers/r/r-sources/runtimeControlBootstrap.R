trace <- function(message) {
    if (!isTRUE(trace_enabled) || !nzchar(trace_path)) {
        return(invisible(NULL))
    }

    line <- paste0(
        format(Sys.time(), "%Y-%m-%d %H:%M:%OS3"),
        " ",
        as.character(message %||% "")
    )
    safe(cat(paste0(line, "\n"), file = trace_path, append = TRUE))

    invisible(NULL)
}


write_meta <- function(meta) {
    if (exists("runtime_bounded_input_config", envir = environment(write_meta), inherits = FALSE) &&
        !is.null(runtime_bounded_input_config)) {
        meta$boundedInput <- "native-v1"
        meta$maxRequestBytes <- max_payload
    }
    if (identical(session_kind, "dedicated")) {
        meta$responseIdentity <- "attachment-request-v1"
        meta$eventIdentity <- "request-nonce-v1"
    }
    if (exists("runtime_ordered_output_config", envir = environment(write_meta), inherits = FALSE) &&
        !is.null(runtime_ordered_output_config)) {
        meta$orderedOutputEncoding <- "utf8"
        meta$orderedOutputSession <- runtime_ordered_output_config$session_id
    }
    safe(writeLines(
        runtime_transport_meta_json(meta),
        meta_path,
        useBytes = TRUE
    ))

    invisible(NULL)
}


runtime_connection_ready <- function(value) {
    !is.null(value) && length(value) && isTRUE(as.logical(value[[1L]]))
}


trace("bootstrap:start")
emit_session_event("starting")

startup_ok <- emit_startup_output({
    repositories <- tryCatch(getOption("repos"), error = function(error) NULL)
    cran <- tryCatch(
        as.character((repositories %||% character(0))[["CRAN"]] %||% ""),
        error = function(error) ""
    )

    if (!nzchar(cran) || identical(cran, "@CRAN@")) {
        options(repos = c(CRAN = "https://cran.case.edu/"))
    }

    install_runtime_console_bindings()
    configure_graphics_device()
})

if (!isTRUE(startup_ok)) {
    emit_session_event("failed")
    write_meta(list(ok = FALSE, error = "startup-failed"))
    return(invisible(NULL))
}

if (!exists("serverSocket", mode = "function")) {
    emit_stream_event("Error: serverSocket unavailable", "stderr")
    emit_session_event("failed")
    write_meta(list(ok = FALSE, error = "serverSocket-unavailable"))
    return(invisible(NULL))
}


runtime_bind_server <- function(requested_port) {
    socket <- safe(serverSocket(port = as.integer(requested_port)))

    if (is.null(socket)) return(NULL)

    list(socket = socket, port = as.integer(requested_port))
}


bound_server <- runtime_bind_server(port)

if (is.null(bound_server)) {
    candidate_ports <- sample.int(40000L, 20L) + 20000L

    for (candidate_port in candidate_ports) {
        bound_server <- runtime_bind_server(candidate_port)

        if (!is.null(bound_server)) break
    }
}

if (is.null(bound_server)) {
    emit_stream_event("Error: server bind failed", "stderr")
    emit_session_event("failed")
    write_meta(list(ok = FALSE, error = "server-bind-failed", port = port))
    return(invisible(NULL))
}

server <- bound_server$socket
port <- bound_server$port
client <- NULL
runtime_control_read_active <- FALSE
if (!exists("runtime_bounded_input_config", inherits = FALSE)) {
    runtime_bounded_input_config <- NULL
}
input_handlers <- list(server = NULL, client = NULL)
idle_scheduler_mode <- "none"
max_payload <- as.integer(Sys.getenv("DM_RUNTIME_CONTROL_MAX_PAYLOAD", "262144"))

if (!is.finite(max_payload) || max_payload < 512L) {
    max_payload <- 262144L
}
if (max_payload > 16777216L) {
    stop("Runtime input exceeds the supported payload ceiling.")
}


register_input_handler <- function(kind, connection) {
    if (!exists("addInputHandler", mode = "function")) {
        return(invisible(FALSE))
    }

    old_handler <- input_handlers[[kind]]

    if (!is.null(old_handler)) safe(removeInputHandler(old_handler))

    handler <- safe(addInputHandler(connection, function(...) {
        safe(process_once())
        TRUE
    }))
    input_handlers[[kind]] <<- handler
    trace(paste0(
        "inputHandler:register kind=",
        kind,
        " ok=",
        !is.null(handler)
    ))

    invisible(!is.null(handler))
}


clear_input_handler <- function(kind) {
    handler <- input_handlers[[kind]]

    if (!is.null(handler)) safe(removeInputHandler(handler))

    input_handlers[[kind]] <<- NULL
    trace(paste0("inputHandler:clear kind=", kind))

    invisible(NULL)
}


eval_code_text <- function(code) {
    withCallingHandlers({
        captured <- utils::capture.output({
            result <- withVisible(eval(parse(text = code), envir = .GlobalEnv))
        }, type = "output")
        captured <- captured[nzchar(captured)]
        value_text <- ""

        if (isTRUE(result$visible)) {
            value_text <- if (is.character(result$value) && length(result$value) == 1L) {
                as.character(result$value)
            } else {
                paste(
                    utils::capture.output(runtime_print_visible_value(result$value)),
                    collapse = "\n"
                )
            }
        }

        if (nzchar(value_text) && grepl("^DM_OK(?:_COND)?\n", value_text)) {
            parts <- strsplit(value_text, "\n", fixed = FALSE)[[1L]]
            tag <- parts[[1L]]
            body <- if (length(parts) > 1L) {
                paste(parts[-1L], collapse = "\n")
            } else {
                ""
            }
            output <- c(captured, body)
            output <- output[nzchar(output)]

            return(paste0(tag, "\n", paste(output, collapse = "\n")))
        }

        output <- c(captured, value_text)
        paste(output[nzchar(output)], collapse = "\n")
    }, error = function(error) {
        app_env$dialog_record_traceback()
    })
}


evaluate_code_result <- function(code) {
    list(ok = TRUE, result = eval_code_text(code))
}


runtime_write_payload <- function(payload) {
    if (isTRUE(runtime_transport_write_failed) || is.null(client)) {
        return(invisible(FALSE))
    }
    writing_client <- client
    written <- tryCatch(
        {
            # Bound only this physical write. Restore the socket's read timeout
            # before returning; an idle console or human prompt is not a write.
            previous_timeout <- socketTimeout(writing_client, 1)
            tryCatch(
                isTRUE(runtime_native_frame_writer(writing_client, payload)),
                finally = socketTimeout(writing_client, previous_timeout)
            )
        },
        error = function(error) FALSE,
        interrupt = function(interrupt) FALSE
    )
    if (!identical(client, writing_client)) {
        suspendInterrupts(safe(close(writing_client)))
        return(invisible(FALSE))
    }
    if (!written) {
        suspendInterrupts({
            runtime_transport_write_failed <<- TRUE
            runtime_close_client(identical(session_kind, "dedicated"))
        })
    }
    invisible(written)
}


runtime_live_event_transport_write <- runtime_write_payload


runtime_accept_client <- function(dedicated) {
    if (!is.null(client)) return(TRUE)

    if (!dedicated) {
        ready <- safe(socketSelect(list(server), timeout = 0))

        if (!runtime_connection_ready(ready)) return(FALSE)
    }

    trace("server:ready accept:start")
    client <<- safe(socketAccept(
        server,
        blocking = TRUE,
        open = "a+b",
        timeout = if (dedicated) 60 else 1,
        options = "no-delay"
    ))

    if (is.null(client)) return(FALSE)
    runtime_transport_write_failed <<- FALSE

    trace("server:accept ok")
    if (!dedicated) register_input_handler("client", client)

    TRUE
}


runtime_close_client <- function(dedicated) {
    trace("client:read eof")
    safe(close(client))
    client <<- NULL

    if (!dedicated) clear_input_handler("client")

    invisible(NULL)
}


runtime_dispatch_request <- function(request) {
    method <- request$method
    if (!identical(request$auth, token)) {
        return(list(
            id = request$id,
            method = method,
            ok = FALSE,
            error = "unauthorized"
        ))
    }

    trace(paste0("request:dispatch-start id=", request$id, " method=", method))
    output <- runtime_evaluate_control_request(request)
    trace(paste0(
        "request:dispatch-done id=",
        request$id,
        " method=",
        method,
        " ok=",
        isTRUE(output$ok)
    ))
    output
}


runtime_read_control_request <- function(dedicated) {
    reading_client <- client
    runtime_control_read_active <<- TRUE
    on.exit(runtime_control_read_active <<- FALSE, add = TRUE)
    result <- tryCatch({
        # process_once already waits for bytes without a frame timeout. Once
        # bytes arrive, an incomplete request must not hold the runtime forever.
        # The helper checks its monotonic whole-frame budget between reads;
        # this shorter backstop bounds a blocking read after the last check.
        previous_timeout <- socketTimeout(reading_client, 1)
        tryCatch({
            if (is.null(runtime_bounded_input_config)) {
                reader <- runtime_native_frame_reader
            } else {
                reader <- runtime_bounded_input_config$reader
            }
            frame <- reader(reading_client, max_payload)
            if (
                !is.list(frame) || !identical(frame$status, "line") ||
                !is.raw(frame$bytes) || length(frame$bytes) > max_payload
            ) {
                frame_status <- "invalid_frame"
                if (
                    is.list(frame) && is.character(frame$status) &&
                    length(frame$status) == 1L && !is.na(frame$status) &&
                    is.element(frame$status, c(
                        "truncated", "too_large", "invalid_nul", "closed_or_failed", "deadline"
                    ))
                ) {
                    frame_status <- frame$status
                }

                list(status = "failed", frame_status = frame_status)
            } else {
                list(status = "line", payload = rawToChar(frame$bytes))
            }
        }, finally = socketTimeout(reading_client, previous_timeout))
    }, error = function(error) list(status = "failed", frame_status = "read_exception"),
        interrupt = function(interrupt) list(status = "interrupted", frame_status = "read_interrupted"))
    if (!identical(client, reading_client)) {
        suspendInterrupts(safe(close(reading_client)))
        return(list(status = "retired"))
    }
    if (!identical(result$status, "line")) {
        trace(paste0(
            "client:input retired status=", result$status, " frame=", result$frame_status
        ))
        suspendInterrupts(runtime_close_client(dedicated))
    }
    result
}


process_once <- function() {
    if (isTRUE(runtime_control_read_active)) {
        return(invisible(NULL))
    }
    dedicated <- identical(session_kind, "dedicated")

    for (iteration in seq_len(16L)) {
        if (!runtime_accept_client(dedicated)) break

        # Do not spend the connection's frame-read timeout while it is idle.
        ready <- safe(socketSelect(
            list(client),
            timeout = if (dedicated) 1 else 0.02
        ))

        if (!runtime_connection_ready(ready)) break

        input <- runtime_read_control_request(dedicated)
        if (!identical(input$status, "line")) {
            if (!is.null(runtime_bounded_input_config)) {
                break
            }
            next
        }
        raw <- input$payload

        if (nchar(raw, type = "bytes") > max_payload) {
            runtime_write_payload(runtime_transport_error_payload(
                "payload-too-large",
                dedicated
            ))
            next
        }

        request <- runtime_transport_decode_request(raw, dedicated)

        if (!isTRUE(request$valid)) {
            runtime_write_payload(runtime_transport_error_payload(
                request$error %||% "invalid-request",
                dedicated
            ))
            next
        }

        trace(paste0("request id=", request$id, " method=", request$method))
        output <- runtime_dispatch_request(request)
        output$transportNonce <- request$transportNonce
        result_json <- runtime_transport_result_json(request$method, output)
        payload <- runtime_transport_response_payload(
            output,
            result_json,
            dedicated
        )
        if (!isTRUE(runtime_write_payload(payload))) {
            break
        }
        trace(paste0("response id=", output$id, " ok=", isTRUE(output$ok)))

        if (dedicated) break
    }

    invisible(NULL)
}


start_idle_scheduler <- function() {
    if (identical(idle_scheduler_mode, "later")) {
        return(invisible(TRUE))
    }

    if (!isTRUE(safe(base::requireNamespace("later", quietly = TRUE)))) {
        trace("idleScheduler:later-unavailable")
        return(invisible(FALSE))
    }

    idle_scheduler_mode <<- "later"
    trace("idleScheduler:later-start")
    tick <- NULL
    tick <- function() {
        if (!identical(idle_scheduler_mode, "later")) {
            return(invisible(NULL))
        }

        safe(process_once())
        safe(later::later(tick, delay = 0.01))

        invisible(NULL)
    }

    safe(later::later(tick, delay = 0.01))

    invisible(TRUE)
}


runtime_prepare_control_functions(app_env)

trace(paste0(
    "inputHandler:available=",
    exists("addInputHandler", mode = "function")
))
trace(paste0("sessionKind=", session_kind))

if (!identical(session_kind, "dedicated")) {
    register_input_handler("server", server)

    if (
        !exists("addInputHandler", mode = "function") &&
        !isTRUE(start_idle_scheduler())
    ) {
        emit_stream_event(
            paste(
                "Error: runtime control wake unsupported",
                "(addInputHandler unavailable; later unavailable)"
            ),
            "stderr"
        )
        emit_session_event("failed")
        write_meta(list(
            ok = FALSE,
            error = "runtime-control-wake-unsupported",
            port = port
        ))
        return(invisible(NULL))
    }

    if (!exists(
        ".app_runtime_control_callback_id",
        envir = .GlobalEnv,
        inherits = FALSE
    )) {
        callback <- addTaskCallback(function(expr, value, ok, visible) {
            safe(process_once())
            safe(flush_completion_queue())

            if (!nzchar(as.character(current_activity_id %||% ""))) {
                emit_state <- get0(
                    ".app_runtime_emit_state",
                    envir = .GlobalEnv,
                    inherits = FALSE
                )

                if (is.function(emit_state)) {
                    emit_state(if (isTRUE(ok)) "idle" else "error")
                }
            }

            TRUE
        }, name = "app_runtime_control")
        assign(
            ".app_runtime_control_callback_id",
            callback,
            envir = .GlobalEnv
        )
    }

    assign(
        ".app_runtime_emit_state",
        function(state) emit_state_event(state),
        envir = .GlobalEnv
    )
}

remove_runtime_global_bindings()

assign(".app_runtime_control_status", function() {
    list(
        hasServer = !is.null(server),
        hasClient = !is.null(client),
        idleScheduler = idle_scheduler_mode %||% "none",
        serverReady = safe(socketSelect(list(server), timeout = 0)),
        clientReady = if (!is.null(client)) {
            safe(socketSelect(list(client), timeout = 0))
        } else {
            NULL
        },
        lastError = last_error %||% ""
    )
}, envir = app_env)

install_prompt_hooks()
safe(options(echo = TRUE))
emit_prompt_state_event()
emit_session_event("ready")
write_meta(list(
    ok = TRUE,
    host = "127.0.0.1",
    port = port,
    token = token,
    pid = Sys.getpid(),
    protocol = if (identical(session_kind, "dedicated")) {
        "dm-runtime-session-v1"
    } else {
        "dm-runtime-control-v2-urlrpc"
    }
))

if (identical(session_kind, "dedicated")) {
    repeat {
        tryCatch(
            suspendInterrupts(safe(process_once())),
            interrupt = function(condition) invisible(NULL)
        )
    }
}

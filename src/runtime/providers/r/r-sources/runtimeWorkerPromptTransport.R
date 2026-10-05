runtime_install_worker_prompt_transport <- function() {
    runtime_install_console_input_scope()
    read_console_line <- runtime_console_input_reader

    runtime_live_event_transport_write <<- function(event) {
        message <- paste0(
            '{"type":"dialogforge-runtime-event","data":', event, "}"
        )
        webr::eval_js(paste0(
            "globalThis.Module.webr.channel.write(", message, "); null"
        ))

        invisible(NULL)
    }

    runtime_prompt_transport_read <<- function(prompt_event) {
        # WebR evaluation temporarily makes R non-interactive. Read the physical
        # worker channel directly instead of using base::readline(), which then
        # returns without reading input. The shared prompt core owns the reply.
        prompt <- paste0("DIALOGFORGE_PROMPT1:", prompt_event)

        read_console_line(prompt, host_transport = TRUE)
    }
    runtime_prompt_transport_publish <<- function(response) {
        message <- paste0(
            '{"type":"dialogforge-prompt-reply","data":', response, "}"
        )
        webr::eval_js(paste0(
            "globalThis.Module.webr.channel.write(", message, "); null"
        ))

        invisible(NULL)
    }

    invisible(TRUE)
}

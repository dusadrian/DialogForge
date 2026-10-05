runtime_sources <- file.path("src", "runtime", "providers", "r", "r-sources")

for (host in c("r", "webr")) {
    for (scenario in c("success", "evaluation-error", "null-result", "flush-error", "active", "reply")) {
        runtime <- new.env(parent = baseenv())
        runtime$`%||%` <- function(value, fallback) {
            if (is.null(value)) {
                return(fallback)
            }
            value
        }
        sys.source(file.path(runtime_sources, "runtimeTransportCore.R"), envir = runtime)
        sys.source(file.path(runtime_sources, "runtimeEventCore.R"), envir = runtime)
        sys.source(file.path(runtime_sources, "runtimeDiagnostics.R"), envir = runtime)

        collecting <- identical(host, "webr")
        previous_events <- if (collecting) "outer-event" else NULL
        previous_diagnostics <- new.env(parent = emptyenv())
        runtime$runtime_collected_events <- previous_events
        runtime$runtime_diagnostics <- previous_diagnostics
        runtime$runtime_transport_event_nonce <- "outer-nonce"
        runtime$live_events_enabled <- FALSE
        runtime$current_activity_id <- if (is.element(scenario, c("active", "reply"))) "active" else ""
        runtime$scenario <- scenario
        runtime$collecting <- collecting
        runtime$evaluations <- 0L
        runtime$flushes <- 0L
        runtime$runtime_diagnostic_json <- function() "[]"
        runtime$json_str <- function(value) paste0('"', value, '"')
        runtime$json_bool <- function(value) {
            if (isTRUE(value)) {
                return("true")
            }
            "false"
        }
        runtime$eval_method <- function(method, params) {
            evaluations <<- evaluations + 1L
            stopifnot(isTRUE(live_events_enabled))
            expected_nonce <- if (identical(method, "reply_prompt")) "outer-nonce" else "request-nonce"
            stopifnot(identical(runtime_transport_event_nonce, expected_nonce))
            if (identical(scenario, "evaluation-error")) {
                stop("synthetic evaluation failure")
            }
            if (collecting) {
                runtime_collected_events <<- c(runtime_collected_events, '{"type":"stream"}')
            }
            if (identical(scenario, "null-result")) {
                return(NULL)
            }
            list(ok = TRUE, result = "accepted")
        }
        runtime$flush_completion_queue <- function() {
            flushes <<- flushes + 1L
            if (identical(scenario, "flush-error")) {
                stop("synthetic completion failure")
            }
            if (collecting) {
                runtime_collected_events <<- c(runtime_collected_events, '{"type":"completion"}')
            }
            invisible(NULL)
        }
        for (name in c("eval_method", "flush_completion_queue", "runtime_diagnostic_json")) {
            environment(runtime[[name]]) <- runtime
        }

        request <- list(
            id = paste0(host, "-request"),
            method = if (identical(scenario, "reply")) "reply_prompt" else "execute_input",
            params = list(diagnosticSession = "case"), transportNonce = "request-nonce"
        )
        result <- runtime$runtime_evaluate_control_request(request, collect_events = collecting)
        payload <- runtime$runtime_transport_response_payload(
            result, runtime$runtime_transport_result_json(request$method, result), TRUE
        )
        stopifnot(identical(
            grepl('"completionFailure":true', payload, fixed = TRUE),
            identical(scenario, "flush-error")
        ))
        stopifnot(identical(result$id, request$id), identical(result$method, request$method))
        stopifnot(identical(runtime$runtime_collected_events, previous_events))
        stopifnot(identical(runtime$runtime_diagnostics, previous_diagnostics))
        stopifnot(identical(runtime$runtime_transport_event_nonce, "outer-nonce"))
        stopifnot(identical(runtime$live_events_enabled, FALSE))

        if (identical(scenario, "active")) {
            stopifnot(!result$ok, identical(result$error, "runtime-command-active"))
            stopifnot(runtime$evaluations == 0L, runtime$flushes == 0L)
        } else {
            stopifnot(runtime$evaluations == 1L, runtime$flushes == 1L)
            if (is.element(scenario, c("success", "reply"))) {
                stopifnot(isTRUE(result$ok), identical(result$result, "accepted"))
            } else {
                expected_error <- switch(scenario,
                    "evaluation-error" = "synthetic evaluation failure",
                    "null-result" = "control-eval-failed",
                    "flush-error" = "synthetic completion failure"
                )
                stopifnot(!result$ok, identical(result$error, expected_error))
                stopifnot(identical(isTRUE(result$completionFailure), identical(scenario, "flush-error")))
            }
            if (collecting) {
                stopifnot(grepl("^\\[", result$events_json))
                stopifnot(!grepl("outer-event", result$events_json, fixed = TRUE))
            } else {
                stopifnot(is.null(result$events_json))
            }
        }
    }
}

cat("Shared request evaluation cases passed; actual native/worker dispatch acceptance remains open.\n")

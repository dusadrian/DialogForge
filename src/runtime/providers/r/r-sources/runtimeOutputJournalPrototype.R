# Prototype only: the native capture adapter must supply writes in source order.
# Do not feed the existing grouped capture result into this journal.
runtime_create_output_journal <- function(session_id, parent_id, publish) {
    valid_identity <- function(value) {
        is.character(value) && length(value) == 1L &&
            !is.na(value) && nzchar(value)
    }

    if (!valid_identity(session_id) || !valid_identity(parent_id)) {
        stop("Output journal requires session and activity identities.")
    }

    if (!is.function(publish)) {
        stop("Output journal requires a publisher.")
    }

    sequence <- 0
    state <- "open"

    publish_record <- function(record) {
        if (!identical(state, "open")) {
            stop("Output journal is not open.")
        }

        if (sequence >= 9007199254740991) {
            state <<- "failed"
            stop("Output journal sequence is exhausted.")
        }

        state <<- "publishing"
        # Reserve before publishing. A failed publication is never replayed.
        sequence <<- sequence + 1
        record$session_id <- session_id
        record$parent_id <- parent_id
        record$output_seq <- sequence
        accepted <- FALSE
        on.exit({
            if (identical(state, "publishing")) {
                state <<- if (accepted) "open" else "failed"
            }
        }, add = TRUE)

        accepted <- identical(publish(record), TRUE)

        if (!accepted || !identical(state, "publishing")) {
            stop("Output journal publication was not accepted.")
        }

        invisible(sequence)
    }

    append <- function(text, channel) {
        if (
            !is.character(text) || length(text) != 1L || is.na(text) ||
            !is.character(channel) || length(channel) != 1L ||
            is.na(channel) || !is.element(channel, c("stdout", "stderr", "warning"))
        ) {
            stop("Output journal requires a text chunk and a known channel.")
        }

        if (!identical(state, "open")) {
            stop("Output journal is not open.")
        }

        if (!nzchar(text)) {
            return(invisible(sequence))
        }

        # Preserve newlines and partial lines exactly; no channel regrouping.
        publish_record(list(type = "stream", text = text, channel = channel))
    }

    seal <- function() {
        if (identical(state, "sealed")) {
            return(invisible(sequence))
        }

        # The publisher reserves the terminal record's own sequence. Build
        # its payload now, before that reservation forces this lazy argument.
        end_record <- list(type = "output_end", last_output_seq = sequence)
        publish_record(end_record)
        state <<- "sealed"

        invisible(sequence)
    }

    retire <- function() {
        state <<- "retired"
        invisible(NULL)
    }

    list(
        append = append,
        seal = seal,
        retire = retire,
        snapshot = function() list(state = state, sequence = sequence)
    )
}

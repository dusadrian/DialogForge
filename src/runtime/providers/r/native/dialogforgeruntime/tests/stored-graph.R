library(dialogforgeruntime)

local({
    original_match <- base::match
    on.exit({
        unlockBinding("match", baseenv())
        assign("match", original_match, envir = baseenv())
        lockBinding("match", baseenv())
    }, add = TRUE)
    unlockBinding("match", baseenv())
    assign("match", function(...) stop("Replaced match invoked"), envir = baseenv())
    lockBinding("match", baseenv())
    result <- match_stored_names(c("Ω", NA_character_, "missing", "Ω"),
        c("first", "Ω", NA_character_, "Ω"))
    empty <- match_stored_names(character(0), character(0))
    rejected <- try(match_stored_names(structure("Ω", class = "foreign"), "Ω"), silent = TRUE)
    stopifnot(identical(result, c(2L, 3L, 0L, 2L)), identical(empty, integer(0)),
        inherits(rejected, "try-error"))
    cat("Stored-name matching bypasses replaced base functions and rejects classed inputs.\n")
})

local({
    for (value in list(
        NULL, c(1, 2), 1:10, 2147483648:2147483650,
        as.character(1:10), list(column = 1:10),
        structure(1:10000, label = "Integer wrapper"),
        structure(2147483648:2147493647, label = "Real wrapper"),
        data.frame(value = 1:3), structure(1, metadata = list(values = 1:4))
    )) {
        stopifnot(stored_graph_is_inspectable(value))
    }
    reference <- new.env(parent = emptyenv())
    makeActiveBinding("callback", function() stop("Reference was inspected"), reference)
    stopifnot(
        !stored_graph_is_inspectable(reference),
        !stored_graph_is_inspectable(list(reference)),
        !stored_graph_is_inspectable(structure(1, metadata = reference)),
        !stored_graph_is_inspectable(vector("list", 5000))
    )
    deep <- 1
    for (index in seq_len(70)) {
        deep <- list(deep)
    }
    stopifnot(!stored_graph_is_inspectable(deep))
    cat("Stored-graph ordinary values and traversal limits passed.\n")
})

runtime_directory <- file.path(
    getwd(),
    "shared",
    "runtime",
    "providers",
    "r",
    "r-sources"
)

if (!is.element("DialogApp", search())) {
    attach(NULL, name = "DialogApp", warn.conflicts = FALSE)
}

runtime_environment <- as.environment("DialogApp")
runtime_environment$opts <- list(
    meta_path = "",
    events_path = "",
    trace_path = "",
    trace_enabled = FALSE,
    session_kind = "interactive",
    token = "",
    port = 0L
)

for (filename in c(
    "backend.R",
    "runtimePrelude.R",
    "runtimeWorkspaceCore.R",
    "runtimeDatasetStateCore.R",
    "runtimeDatasetCore.R",
    "runtimeDispatchCore.R"
)) {
    source(
        file.path(runtime_directory, filename),
        local = runtime_environment,
        echo = FALSE,
        verbose = FALSE,
        print.eval = FALSE
    )
}

dataset <- as.data.frame(setNames(
    replicate(343L, seq_len(1846L), simplify = FALSE),
    paste0("V", seq_len(343L))
))
original_classifier <- runtime_environment$workspace_dataset_item_flags
classification_count <- 0L
runtime_environment$workspace_dataset_item_flags <- function(column) {
    classification_count <<- classification_count + 1L
    original_classifier(column)
}

initial_state <- runtime_environment$dataset_state_current(
    "ess",
    dataset
)
stopifnot(classification_count == 343L)
stopifnot(length(initial_state$columnFlags) == 343L)

classification_count <- 0L
unchanged_state <- runtime_environment$dataset_state_current(
    "ess",
    dataset,
    initial_state
)
stopifnot(classification_count == 0L)
stopifnot(identical(unchanged_state$columnFlags, initial_state$columnFlags))

dataset$V172[[1L]] <- -1L
classification_count <- 0L
value_changed_state <- runtime_environment$dataset_state_current(
    "ess",
    dataset,
    unchanged_state
)
stopifnot(classification_count == 1L)
stopifnot(identical(
    value_changed_state$columnFlags$V1,
    unchanged_state$columnFlags$V1
))

attr(dataset$V10, "label") <- "Changed label"
classification_count <- 0L
metadata_changed_state <- runtime_environment$dataset_state_current(
    "ess",
    dataset,
    value_changed_state
)
stopifnot(classification_count == 1L)

dataset$added <- rep(c(0, 1), length.out = nrow(dataset))
classification_count <- 0L
column_added_state <- runtime_environment$dataset_state_current(
    "ess",
    dataset,
    metadata_changed_state
)
stopifnot(classification_count == 1L)
stopifnot(isTRUE(column_added_state$columnFlags$added$calibrated))

dataset$added <- NULL
classification_count <- 0L
column_removed_state <- runtime_environment$dataset_state_current(
    "ess",
    dataset,
    column_added_state
)
stopifnot(classification_count == 0L)
stopifnot(is.null(column_removed_state$columnFlags$added))

workspace_index <- list(
    last_state = list(
        signatures = list(),
        variables = list(),
        datasetStates = list(ess = column_removed_state),
        select = list(
            list = character(0),
            matrix = character(0),
            vector = character(0)
        ),
        searchPath = search(),
        objectCount = 1L
    )
)
runtime_environment$workspace_index_get <- function(key, default = NULL) {
    value <- workspace_index[[as.character(key)]]
    if (is.null(value)) default else value
}
runtime_environment$workspace_index_set <- function(key, value) {
    workspace_index[[as.character(key)]] <<- value
    invisible(value)
}
assign("ess", dataset, envir = .GlobalEnv)
rm(dataset)

classification_count <- 0L
schema <- runtime_environment$workspace_dataset_schema("ess")
stopifnot(classification_count == 0L)
stopifnot(isTRUE(schema$ok))

classification_count <- 0L
snapshot <- suppressWarnings(runtime_environment$workspace_snapshot())
stopifnot(classification_count == 0L)
stopifnot(length(snapshot$dataframe$ess$calibrated) == 343L)
workspace_index$last_state <- runtime_environment$workspace_state_from_snapshot(
    snapshot
)

externally_changed <- get("ess", envir = .GlobalEnv, inherits = FALSE)
externally_changed$V1[[1L]] <- -99L
assign("ess", externally_changed, envir = .GlobalEnv)
rm(externally_changed)

classification_count <- 0L
cached_snapshot <- suppressWarnings(
    runtime_environment$runtime_cached_workspace_snapshot()
)
stopifnot(classification_count == 0L)

classification_count <- 0L
refreshed_snapshot <- suppressWarnings(
    runtime_environment$runtime_refresh_workspace_index()
)
stopifnot(classification_count == 1L)

cat("Incremental workspace classification verified.\n")

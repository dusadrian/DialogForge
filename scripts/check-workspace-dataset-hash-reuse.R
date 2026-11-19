# Run in a disposable R process from the repository root.
local({
    runtime <- new.env(parent = baseenv())
    runtime$opts <- list()
    runtime$runtime_inspection_library <- Sys.getenv("DIALOGFORGE_TEST_INSPECTION_LIBRARY",
        unset = file.path("dist/r-runtime/native", paste(R.version$platform, getRversion(), sep = "-")))
    for (file in c("runtimePrelude.R", "runtimeBindingInspection.R", "runtimeWorkspaceCore.R",
        "runtimeDatasetCore.R", "runtimeDatasetStateCore.R", "runtimeEventCore.R", "runtimeDispatchCore.R")) {
        sys.source(file.path("src/runtime/providers/r/r-sources", file), runtime)
    }

    fixture_names <- c("hash_probe", "hash_peer", "hash_counter", "hash_renamed", "hash_reader", "hash_read_value")
    stopifnot(!any(vapply(fixture_names, exists, logical(1), envir = .GlobalEnv, inherits = FALSE)))
    runtime$runtime_global_names <- function() intersect(ls(.GlobalEnv), fixture_names)
    on.exit(rm(list = runtime$runtime_global_names(), envir = .GlobalEnv), add = TRUE)

    hashes <- 0L
    runtime$runtime_diagnostic_mark <- function(...) invisible(NULL)
    runtime$runtime_diagnostic_count <- function(name, count = 1L) {
        if (identical(name, "dataset_hashes")) {
            hashes <<- hashes + count
        }
    }
    assign("hash_probe", data.frame(value = c(1L, 2L)), .GlobalEnv)
    assign("hash_peer", data.frame(value = c(3L, 4L)), .GlobalEnv)
    assign("hash_counter", 0L, .GlobalEnv)
    runtime$runtime_workspace_delta()

    submit <- function(code, expected_hashes) {
        hashes <<- 0L
        effect <- runtime$runtime_workspace_command_effect(parse(text = code))
        eval(parse(text = code), .GlobalEnv)
        result <- runtime$runtime_reconcile_command_workspace(code, effect)
        stopifnot(!result$failed, hashes == expected_hashes)
        result$change
    }
    change <- submit("hash_counter <- 4L", 0L)
    stopifnot(identical(change$update$updated[[1L]]$access_key, "hash_counter"))
    submit("invisible(hash_counter)", 0L)

    # A hidden service can mutate data between visible commands.
    hidden <- runtime$eval_method("evaluate_code", list(code = "hash_peer$value[1] <- 81L"))
    stopifnot(!runtime$workspace_hashes_current, hash_peer$value[1] == 81L)
    change <- submit("hash_counter <- 5L", 2L)
    stopifnot(identical(change$state$datasetStates$hash_peer$objectHash, runtime$workspace_value_hash(hash_peer)),
        length(change$update$datasets$changed) > 0L)
    submit("hash_counter <- 6L", 0L)

    # Rename hashes the new name. An active source may also change its hash_peer.
    hashes <- 0L
    result <- runtime$runtime_workspace_rename(list(oldName = "hash_probe", newName = "hash_renamed"))
    stopifnot(result$ok, hashes == 1L, identical(names(result$result$datasetStates), c("hash_peer", "hash_renamed")))
    makeActiveBinding("hash_reader", function() { hash_peer$value[1] <<- 82L; 1L }, .GlobalEnv)
    runtime$runtime_workspace_delta()
    hashes <- 0L
    result <- runtime$runtime_workspace_rename(list(oldName = "hash_reader", newName = "hash_read_value"))
    stopifnot(result$ok, hashes == 2L, hash_peer$value[1] == 82L,
        identical(result$result$datasetStates$hash_peer$objectHash, runtime$workspace_value_hash(hash_peer)))

    # A failed narrow attempt must retry with a full scan.
    original <- runtime$collect_workspace_update
    attempts <- 0L
    runtime$collect_workspace_update <- function(previous_state, changed_bindings = NULL) {
        attempts <<- attempts + 1L
        if (attempts == 1L && !is.null(changed_bindings)) {
            stop("injected first-attempt failure")
        }
        original(previous_state, changed_bindings)
    }
    submit("hash_counter <- 7L", 2L)
    stopifnot(attempts == 2L)
    runtime$collect_workspace_update <- original

    # Discarding a reference object and recovering a missing digest both
    # require another inspection.
    assign("hash_counter", new.env(parent = emptyenv()), .GlobalEnv)
    runtime$runtime_workspace_delta()
    submit("hash_counter <- 8L", 2L)
    state <- runtime$workspace_index_get("last_state")
    state$datasetStates$hash_peer$objectHash <- ""
    runtime$workspace_index_set("last_state", state)
    change <- submit("hash_counter <- 9L", 1L)
    stopifnot(nzchar(change$state$datasetStates$hash_peer$objectHash))
    cat("Workspace dataset hash reuse, hidden mutation, rename and full retry passed.\n")
})

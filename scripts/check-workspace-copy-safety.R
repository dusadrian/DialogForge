# Run from the repository root: Rscript scripts/check-workspace-copy-safety.R
# Uses a disposable R process; never sources the interactive application backend.
local({
    runtime <- new.env(parent = baseenv())
    runtime$runtime_inspection_library <- Sys.getenv("DIALOGFORGE_TEST_INSPECTION_LIBRARY", unset = file.path(
        "dist/r-inspection/native", paste(R.version$platform, getRversion(), sep = "-")
    ))
    sys.source(
        "src/runtime/providers/r/r-sources/runtimeBindingInspection.R",
        envir = runtime
    )
    runtime$`%||%` <- function(value, fallback) {
        if (is.null(value)) fallback else value
    }
    runtime$runtime_time_ms <- function() 1
    sys.source(
        "src/runtime/providers/r/r-sources/runtimeDatasetStateCore.R",
        envir = runtime
    )
    reusable <- runtime$workspace_copy_value_is_reusable

    stopifnot(
        reusable(NULL),
        reusable(1:10),
        reusable(list(NULL, list(value = 1))),
        reusable(matrix(1:6, nrow = 2)),
        reusable(data.frame(value = 1:3, label = c("a", "b", "c")))
    )

    # Stock attached exports are allowed by provenance, not environment names.
    matrix_scope <- "DF_copy_matrix_methods"
    matrix_hits <- 0L
    matrix_value <- matrix(1:6, nrow = 2)
    stopifnot(!is.element(matrix_scope, search()))
    attach(list(head.matrix = function(...) {
        matrix_hits <<- matrix_hits + 1L
        stop("Copy eligibility invoked an attached method")
    }), name = matrix_scope)
    tryCatch({
        stopifnot(!reusable(matrix_value), matrix_hits == 0L)
    }, finally = detach(matrix_scope, character.only = TRUE))
    stopifnot(reusable(matrix_value), matrix_hits == 0L)

    reference <- new.env(parent = emptyenv())
    makeActiveBinding("active", function() {
        stop("Copy eligibility must not invoke an active binding")
    }, reference)
    delayedAssign("lazy", stop("Copy eligibility must not force a promise"),
        assign.env = reference)

    stopifnot(
        !reusable(reference),
        !reusable(list(reference)),
        !reusable(list(list(reference))),
        !reusable(structure(1, metadata = reference)),
        !reusable(data.frame(column = I(list(reference)))),
        !reusable(function() NULL),
        !reusable(list(function() NULL)),
        !reusable(quote(x + 1)),
        !reusable(new("externalptr")),
        !reusable(factor("a"))
    )

    runtime$length.DFCopyProbe <- function(x) stop("length method called")
    runtime$`[[.DFCopyProbe` <- function(x, ...) stop("subset method called")
    custom <- structure(list(1), class = "DFCopyProbe")
    stopifnot(!reusable(custom), !reusable(list(custom)))

    # Large or deeply nested graphs fall back without unbounded recursion.
    nested <- NULL
    for (index in seq_len(4100)) {
        nested <- list(nested)
    }
    stopifnot(!reusable(nested), !reusable(rep(list(NULL), 4096)))

    source_name <- "DF_copy_safety_source"
    target_name <- "DF_copy_safety_target"
    stopifnot(!exists(source_name, .GlobalEnv), !exists(target_name, .GlobalEnv))
    on.exit(rm(list = c(source_name, target_name), envir = .GlobalEnv), add = TRUE)

    previous <- list(
        signatures = setNames(list("known-signature"), source_name),
        variables = setNames(list(list(access_key = source_name)), source_name)
    )
    for (value in list(1:3, list(reference), custom)) {
        assign(source_name, value, .GlobalEnv)
        assign(target_name, value, .GlobalEnv)
        copied <- runtime$workspace_copy_cached_state(
            previous, source_name, target_name
        )
        if (is.integer(value)) {
            stopifnot(identical(copied$update$added[[1]]$access_key, target_name))
        }
        else {
            stopifnot(is.null(copied))
        }
    }

    cat("Workspace copy safety: stored values, nested references, custom classes and bounded traversal passed.\n")
})

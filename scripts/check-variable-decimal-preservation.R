# Run only with explicit authorization, from the repository root.
local({
    runtime <- new.env(parent = globalenv())
    runtime$opts <- list()
    for (file in c("runtimePrelude.R", "runtimeWorkspaceCore.R", "runtimeDatasetCore.R")) {
        sys.source(file.path("src/runtime/providers/r/r-sources", file), envir = runtime)
    }

    column <- c(1.25, 2.5, NA_real_)
    request <- list(has_decimals = FALSE)
    stopifnot(is.null(runtime$workspace_dataset_target_decimals(request, column)))

    for (value in list(2L, 2, "2")) {
        attr(column, "decimals") <- value
        stopifnot(identical(runtime$workspace_dataset_target_decimals(request, column), 2L))
    }
    for (value in list(NA_integer_, "invalid", character(0))) {
        attr(column, "decimals") <- value
        stopifnot(is.null(runtime$workspace_dataset_target_decimals(request, column)))
    }
    stopifnot(identical(runtime$workspace_dataset_target_decimals(
        list(has_decimals = TRUE, decimals = 3L), column
    ), 3L))

    # Use the real package to catch numeric/text argument mismatches, not a stub.
    if (!requireNamespace("declared", quietly = TRUE)) {
        stop("This acceptance requires the declared package.")
    }
    attr(column, "decimals") <- 2L
    request <- runtime$workspace_dataset_variable_request(
        NULL, NULL, "Preserved decimal label", NULL, NULL, NULL, NULL, NULL
    )
    attributes <- runtime$workspace_dataset_declared_attributes(column)
    result <- runtime$workspace_dataset_declare_variable(
        column, column, request, attributes, asNamespace("declared")
    )
    stopifnot(isTRUE(result$ok))
    stopifnot(identical(attr(result$value, "label"), "Preserved decimal label"))
    stopifnot(identical(as.integer(attr(result$value, "decimals")), 2L))
    cat("Variable decimal preservation cases passed.\n")
})

# SAME receipt classifier; disposable R process, no interactive backend.
local({
    runtime <- new.env(parent = baseenv())
    runtime$opts <- list()
    sys.source("src/runtime/providers/r/r-sources/runtimePrelude.R", envir = runtime)
    sys.source("src/runtime/providers/r/r-sources/runtimeDatasetStateCore.R", envir = runtime)
    previous <- list(
        name = "data", columns = c("x", "y"), columnsSig = "x\ry",
        columnCount = 2L, rowCount = 2L,
        columnHash = list(x = "old-x", y = "old-y"),
        columnMetaSig = list(x = "old-meta-x", y = "old-meta-y")
    )
    changed <- previous
    changed$columnHash$x <- "new-x"
    changed$columnMetaSig$x <- "new-meta-x"
    changes <- runtime$dataset_change(previous, changed)
    stopifnot(
        identical(vapply(changes, function(change) change$kind, character(1)),
            c("dataset_variable_meta_changed", "dataset_cells_changed")),
        identical(changes[[1L]]$columns, "x"),
        identical(changes[[2L]]$columns, "x")
    )

    changed$columnHash$y <- "new-y"
    changes <- runtime$dataset_change(previous, changed)
    stopifnot(
        identical(changes[[1L]]$columns, "x"),
        identical(changes[[2L]]$columns, c("x", "y"))
    )
    changed$columnMetaSig <- previous$columnMetaSig
    changes <- runtime$dataset_change(previous, changed)
    stopifnot(
        length(changes) == 1L,
        identical(changes[[1L]]$kind, "dataset_cells_changed"),
        is.null(runtime$dataset_change(previous, previous))
    )
    cat("Mixed metadata/value receipts retain both cache effects.\n")
})

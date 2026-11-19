# Run in a disposable R process. Read the same snapshot pages as the editor.
local({
    runtime <- new.env(parent = baseenv())
    runtime$opts <- list()
    sources <- "src/runtime/providers/r/r-sources"
    for (file in c("runtimePrelude.R", "runtimeDatasetStateCore.R", "runtimeDatasetCore.R")) {
        sys.source(file.path(sources, file), envir = runtime)
    }

    value <- strrep("é", 230L)
    label <- paste0("label ", value)
    data <- data.frame(text = value, category = value)
    attr(data$category, "labels") <- setNames(value, label)
    assign("clipboard_fixture", data, envir = .GlobalEnv)
    page <- function(column, labels, row = 1L) {
        runtime$workspace_column_clipboard_page(list(
            key = paste0(column, labels), name = "clipboard_fixture",
            column = column, includeLabels = labels, rowStart = row
        ))$result_json
    }
    expected <- paste0('{"total":1,"values":[', runtime$json_str(value), ']}')
    stopifnot(
        identical(runtime$cell_scalar_text(value), paste0(substr(value, 1L, 160L), "...")),
        identical(page("text", FALSE), expected),
        identical(page("text", TRUE), expected),
        identical(page("category", FALSE), expected),
        identical(page("category", TRUE), paste0('{"total":1,"values":[[',
            runtime$json_str(value), ',', runtime$json_str(label), ']]}'))
    )

    oversized <- strrep("é", 140000L)
    assign("clipboard_fixture", data.frame(text = c(oversized, "next")), envir = .GlobalEnv)
    stopifnot(
        identical(page("text", FALSE), paste0('{"total":2,"values":[', runtime$json_str(oversized), ']}')),
        identical(page("text", FALSE, 2L), '{"total":2,"values":["next"]}')
    )
    cat("Full clipboard values, labels, oversized rows and bounded previews passed.\n")
})

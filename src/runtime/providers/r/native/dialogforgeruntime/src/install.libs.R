destination <- file.path(Sys.getenv("R_PACKAGE_DIR"), "libs", Sys.getenv("R_ARCH"))
dir.create(destination, recursive = TRUE, showWarnings = FALSE)
files <- paste0("dialogforgeruntime", .Platform$dynlib.ext)
if (.Platform$OS.type == "windows") {
    files <- c(files, "dialogforge-r-host.exe")
}
missing_files <- files[!file.exists(files)]
if (length(missing_files)) {
    stop(paste0(
        "Missing required DialogForge runtime helper payload: ",
        paste(missing_files, collapse = ", "), "."
    ))
}
if (!all(file.copy(files, destination))) {
    stop("Could not install the complete DialogForge runtime helper payload.")
}

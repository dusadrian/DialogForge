destination <- file.path(Sys.getenv("R_PACKAGE_DIR"), "libs", Sys.getenv("R_ARCH"))
dir.create(destination, recursive = TRUE, showWarnings = FALSE)
files <- Sys.glob(paste0("*", .Platform$dynlib.ext))
if (.Platform$OS.type == "windows") {
    files <- c(files, "dialogforge-r-host.exe")
}
if (!length(files) || !all(file.exists(files)) || !all(file.copy(files, destination))) {
    stop("Could not install the complete DialogForge runtime helper payload.")
}

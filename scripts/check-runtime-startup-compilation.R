# Source-only fixture: run explicitly when authorized. Does not launch either app.
sources <- "src/runtime/providers/r/r-sources"
cache_path <- Sys.getenv("DIALOGFORGE_TEST_CONTROL_CACHE_PATH", unset = file.path(
    "dist", sources, "runtime-control-cache.rds"
))
initialization <- new.env(parent = baseenv())
sys.source(file.path(sources, "runtimeInitialization.R"), initialization)
previous_jit <- compiler::enableJIT(3L)

tryCatch({
    if (identical(Sys.getenv("DIALOGFORGE_TEST_CONTROL_CACHE"), "1")) {
        local({
            cache <- readRDS(cache_path)
            invalid_path <- tempfile("control-cache-invalid-")
            on.exit(unlink(invalid_path), add = TRUE)
            stopifnot(
                is.null(initialization$runtime_read_control_compilation_cache("")),
                is.null(initialization$runtime_read_control_compilation_cache(1L)),
                is.null(initialization$runtime_read_control_compilation_cache(invalid_path))
            )
            for (field in c("format", "r_version", "optimization", "functions")) {
                invalid <- cache
                invalid[[field]] <- "unsupported"
                saveRDS(invalid, invalid_path)
                stopifnot(is.null(initialization$runtime_read_control_compilation_cache(invalid_path)))
            }
            saveRDS(list(format = 1L), invalid_path)
            stopifnot(is.null(initialization$runtime_read_control_compilation_cache(invalid_path)))
        })
    }
    for (host in c("native", "worker")) {
        runtime <- new.env(parent = globalenv())
        runtime$runtime_inspection_library <- Sys.getenv("DIALOGFORGE_TEST_INSPECTION_LIBRARY", unset = file.path(
            "dist/r-runtime/native", paste(R.version$platform, getRversion(), sep = "-")
        ))
        runtime$opts <- list()
        for (name in c(
            "runtimePrelude.R", "runtimeBindingInspection.R", "runtimeWorkspaceCore.R",
            "runtimeDatasetStateCore.R", "runtimeDatasetCore.R"
        )) {
            sys.source(file.path(sources, name), runtime)
        }
        runtime$fixture_name <- "DF_startup_compilation_probe"
        evalq({
            runtime_global_names <- function() fixture_name
            runtime_diagnostic_count <- function(...) invisible(NULL)
            runtime_diagnostic_mark <- function(...) invisible(NULL)
        }, runtime)
        stopifnot(!exists(runtime$fixture_name, .GlobalEnv, inherits = FALSE))

        # Preparation must not read lazy/active bindings or execute helpers.
        hits <- 0L
        hostile <- compiler::cmpfun(function(...) {
            hits <<- hits + 1L
            stop("Startup preparation or bookkeeping invoked a user method")
        })
        makeActiveBinding("active_fixture", hostile, runtime)
        delayedAssign("lazy_fixture", hostile(), assign.env = runtime)
        runtime$stock_alias <- utils::head
        alias <- runtime$stock_alias
        if (identical(Sys.getenv("DIALOGFORGE_TEST_CONTROL_CACHE"), "1")) {
            runtime$runtime_control_compilation_cache <-
                initialization$runtime_read_control_compilation_cache(
                    cache_path
                )
            stopifnot(length(runtime$runtime_control_compilation_cache) > 300L)
            # An uncompiled or changed entry must never bypass preparation.
            runtime$runtime_control_compilation_cache$dataset_changed_columns <-
                runtime$dataset_changed_columns
            runtime$runtime_control_compilation_cache$workspace_snapshot <-
                compiler::cmpfun(function() stop("stale cached body executed"))
            # Preserve executable syntax while retaining nested worker source
            # references. This is not a second host implementation.
            runtime$workspace_dataset_variable_page <- eval(
                parse(text = paste(deparse(runtime$workspace_dataset_variable_page), collapse = "\n"),
                    keep.source = TRUE), envir = runtime
            )
            source_attributes <- attributes(runtime$workspace_dataset_variable_page)
        }
        table_fixture <- data.frame(value = 1:3)
        jit_before <- compiler::enableJIT(-1L)
        prepared <- initialization$runtime_prepare_control_functions(runtime)
        if (identical(Sys.getenv("DIALOGFORGE_TEST_CONTROL_CACHE"), "1")) {
            stopifnot(
                runtime$runtime_control_compilation_cache_hits > 100L,
                runtime$runtime_control_closure_is_compiled(runtime$dataset_changed_columns),
                runtime$runtime_control_closure_is_compiled(runtime$workspace_snapshot),
                identical(attributes(runtime$workspace_dataset_variable_page), source_attributes),
                !runtime$runtime_control_closure_is_compiled(
                    eval(parse(text = "function() NULL")[[1L]], envir = baseenv())
                ),
                !runtime$runtime_control_closure_is_compiled(1L),
                !runtime$runtime_control_closure_is_compiled(.Primitive("sum"))
            )
        }
        stopifnot(
            is.element("dataset_changed_columns", prepared),
            identical(environment(runtime$dataset_changed_columns), runtime),
            identical(runtime$stock_alias, alias),
            compiler::enableJIT(-1L) == jit_before,
            hits == 0L,
            length(initialization$runtime_prepare_control_functions(runtime)) == 0L
        )

        # Leave JIT enabled: invoke the prepared helper for the first time with
        # a hostile generic already installed. Test code stays at top level.
        for (method in c("unique.character", "unique.default")) {
            stopifnot(!exists(method, .GlobalEnv, inherits = FALSE))
            assign(method, hostile, .GlobalEnv)
            tryCatch({
                declared_loaded <- isNamespaceLoaded("declared")
                assign(runtime$fixture_name, 1:3, .GlobalEnv)
                snapshot <- runtime$workspace_snapshot()
                previous <- runtime$workspace_state_from_snapshot(snapshot)
                assign(runtime$fixture_name, 4:6, .GlobalEnv)
                reconciled <- runtime$collect_workspace_update(previous)
                stopifnot(
                    identical(runtime$dataset_changed_columns(
                        c("a", "b"), c("b", "a")
                    ), c("b", "a")),
                    identical(snapshot$variables[[1]]$display_value,
                        if (method == "unique.default") "" else "1, 2, 3"),
                    identical(reconciled$state$variables[[runtime$fixture_name]]$display_value,
                        if (method == "unique.default") "" else "4, 5, 6"),
                    hits == 0L,
                    compiler::enableJIT(-1L) == jit_before
                )
                assign(runtime$fixture_name, table_fixture, .GlobalEnv)
                table_snapshot <- runtime$workspace_snapshot()
                stopifnot(
                    identical(table_snapshot$variables[[1]]$display_value, ""),
                    !table_snapshot$variables[[1]]$has_viewer,
                    identical(isNamespaceLoaded("declared"), declared_loaded),
                    hits == 0L
                )
            }, finally = rm(list = c(method, runtime$fixture_name), envir = .GlobalEnv))
        }
        assign(runtime$fixture_name, 4:6, .GlobalEnv)
        tryCatch({
            recovered <- runtime$workspace_snapshot()
            stopifnot(identical(recovered$variables[[1]]$display_value, "4, 5, 6"))
            assign(runtime$fixture_name, table_fixture, .GlobalEnv)
            recovered_table <- runtime$workspace_snapshot()
            stopifnot(
                recovered_table$variables[[1]]$has_viewer,
                identical(recovered_table$variables[[1]]$display_value, "3 x 1")
            )
        }, finally = rm(list = runtime$fixture_name, envir = .GlobalEnv))

        # A later startup stage can replace a helper without causing all
        # previously prepared closures to be compiled for a second time.
        replacement <- function() "replacement"
        environment(replacement) <- runtime
        runtime$dataset_changed_columns <- replacement
        stopifnot(identical(
            initialization$runtime_prepare_control_functions(runtime),
            "dataset_changed_columns"
        ))
        stopifnot(identical(runtime$dataset_changed_columns(), "replacement"))
    }
}, finally = compiler::enableJIT(previous_jit))

cat("Shared startup compilation cases passed; real host/default-JIT acceptance remains separate.\n")

# Automatic refresh must not invoke user replacements for standard-class methods.
# Run only in a disposable R process from the repository root.
local({
    # Exercise our inspection code, not R's JIT compiler: its own name
    # bookkeeping calls generic unique() while compiling a first-use helper.
    # Default-JIT end-to-end acceptance remains a separate requirement.
    previous_jit <- compiler::enableJIT(0L)
    on.exit(compiler::enableJIT(previous_jit), add = TRUE)
    runtime <- new.env(parent = globalenv())
    runtime$opts <- list()
    runtime$runtime_inspection_library <- Sys.getenv("DIALOGFORGE_TEST_INSPECTION_LIBRARY", unset = file.path(
        "dist/r-runtime/native", paste(R.version$platform, getRversion(), sep = "-")
    ))
    sources <- "src/runtime/providers/r/r-sources"
    for (file in c(
        "runtimePrelude.R", "runtimeBindingInspection.R", "runtimeWorkspaceCore.R",
        "runtimeDatasetCore.R", "runtimeDatasetStateCore.R"
    )) {
        sys.source(file.path(sources, file), envir = runtime)
    }
    runtime$runtime_diagnostic_count <- function(...) invisible(NULL)
    runtime$runtime_diagnostic_mark <- function(...) invisible(NULL)

    fixture_name <- "DF_standard_method_probe"
    method_name <- "length.Date"
    stopifnot(
        !exists(fixture_name, .GlobalEnv, inherits = FALSE),
        !exists(method_name, .GlobalEnv, inherits = FALSE)
    )
    runtime$runtime_global_names <- function() fixture_name
    assign(fixture_name, as.Date("2026-09-29"), .GlobalEnv)
    hits <- 0L
    assign(method_name, function(x) {
        hits <<- hits + 1L
        length(unclass(x))
    }, .GlobalEnv)
    on.exit(rm(
        list = intersect(c(fixture_name, method_name), ls(.GlobalEnv, all.names = TRUE)),
        envir = .GlobalEnv
    ), add = TRUE)

    snapshot <- runtime$workspace_snapshot()
    snapshot_hits <- hits
    stopifnot(
        identical(snapshot$variables[[1]]$display_value, ""),
        identical(snapshot$variables[[1]]$display_type, "Date"),
        !snapshot$variables[[1]]$has_children
    )
    hits <- 0L
    runtime$collect_workspace_update(runtime$workspace_state_from_snapshot(snapshot))
    update_hits <- hits
    cat("Standard Date override calls: snapshot =", snapshot_hits,
        "; update =", update_hits, "\n")
    stopifnot(snapshot_hits == 0L, update_hits == 0L)

    # A fresh scan must recover detailed display when the override is removed.
    rm(list = method_name, envir = .GlobalEnv)
    recovered <- runtime$collect_workspace_update(
        runtime$workspace_state_from_snapshot(snapshot)
    )
    stopifnot(identical(
        recovered$state$variables[[fixture_name]]$display_value, "2026-09-29"
    ))

    # Detection must not read active or delayed method bindings.
    hostile <- function(...) {
        hits <<- hits + 1L
        stop("Inspection evaluated an overridden standard method")
    }
    makeActiveBinding(method_name, hostile, .GlobalEnv)
    stopifnot(identical(runtime$workspace_snapshot()$variables[[1]]$display_value, ""))
    rm(list = method_name, envir = .GlobalEnv)
    delayedAssign("length.Date", hostile(), assign.env = .GlobalEnv)
    stopifnot(identical(runtime$workspace_snapshot()$variables[[1]]$display_value, ""))
    rm(list = method_name, envir = .GlobalEnv)

    # Inspectable outer containers cannot hide a column with overridden methods.
    frame <- data.frame(date = as.Date("2026-09-29"))
    assign(fixture_name, frame, .GlobalEnv)
    assign(method_name, hostile, .GlobalEnv)
    nested <- runtime$workspace_snapshot()
    stopifnot(
        identical(nested$variables[[1]]$display_type, "data.frame"),
        identical(nested$variables[[1]]$display_value, ""),
        !nested$variables[[1]]$has_viewer,
        length(nested$datasetStates) == 0L
    )
    rm(list = method_name, envir = .GlobalEnv)

    # Attached methods are visible to dispatch too; no method call is needed
    # to recognize the override. Detaching restores the ordinary frame path.
    attached_name <- "DF_standard_method_overrides"
    stopifnot(!is.element(attached_name, search()))
    attach(setNames(list(hostile), method_name), name = attached_name)
    tryCatch({
        stopifnot(identical(runtime$workspace_snapshot()$variables[[1]]$display_value, ""))
    }, finally = detach(attached_name, character.only = TRUE))
    ordinary <- runtime$workspace_snapshot()
    stopifnot(
        ordinary$variables[[1]]$has_viewer,
        identical(ordinary$variables[[1]]$display_value, "1 x 1"),
        hits == 0L
    )
    fixtures <- list(
        "dim.data.frame" = frame,
        "[.factor" = factor(c("a", "b")),
        "length.ordered" = ordered(c("a", "b")),
        "format.POSIXct" = as.POSIXct("2026-09-29", tz = "UTC"),
        "as.character.POSIXlt" = as.Date("2026-09-29"),
        "units.difftime" = as.difftime(1, units = "days"),
        "+.Date" = as.Date("2026-09-29"),
        "==.factor" = factor(c("a", "b")),
        "round.difftime" = as.difftime(1, units = "days"),
        "min.POSIXct" = as.POSIXct("2026-09-29", tz = "UTC"),
        "head.integer" = 1:3,
        "head.numeric" = c(1, 2, 3),
        "head.list" = list(1, 2),
        "head.matrix" = matrix(1:4, nrow = 2),
        "head.array" = array(1:8, dim = c(2, 2, 2)),
        "head.default" = 1:3,
        "format.default" = frame,
        "str.default" = list(column = 1:3),
        "as.character.difftime" = as.difftime(1, units = "days")
    )
    if (requireNamespace("declared", quietly = TRUE)) {
        declared_column <- declared::declared(c(1.25, 2.5), label = "Stored label", decimals = 2L)
        declared_frame <- data.frame(value = c(1.25, 2.5))
        declared_frame$value <- declared_column
        # A restored class must remain eligible before a dialog loads declared.
        unloadNamespace("declared")
        stopifnot(
            !isNamespaceLoaded("declared"),
            is.null(runtime$workspace_restricted_variable(
                fixture_name, declared_frame, 1
            )),
            !isNamespaceLoaded("declared")
        )
        # Keep other package hooks, replace our observer on re-source, and
        # preserve retained identity without loading the unloaded namespace.
        hook_name <- packageEvent("declared", "onUnload")
        before_hooks <- getHook(hook_name)
        retained_namespace <- runtime$runtime_inspection_declared_namespace()
        sys.source(file.path(sources, "runtimeBindingInspection.R"), envir = runtime)
        stopifnot(
            length(getHook(hook_name)) == length(before_hooks),
            identical(runtime$runtime_inspection_declared_namespace(), retained_namespace),
            !is.element("declared", runtime$workspace_overridden_inspection_classes()),
            !isNamespaceLoaded("declared")
        )
        local({
            table <- get(".__S3MethodsTable__.", asNamespace("base"), inherits = FALSE)
            name <- "[.declared"
            original <- get(name, table, inherits = FALSE)
            restore <- function() {
                if (exists(name, table, inherits = FALSE)) rm(list = name, envir = table)
                assign(name, original, table)
            }
            on.exit(restore(), add = TRUE)
            for (kind in c("value", "active", "delayed")) {
                rm(list = name, envir = table)
                if (identical(kind, "value")) {
                    assign(name, hostile, table)
                }
                else if (identical(kind, "active")) {
                    makeActiveBinding(name, hostile, table)
                }
                else {
                    delayedAssign(name, hostile(), assign.env = table)
                }
                stopifnot(
                    !is.null(runtime$workspace_restricted_variable(
                        fixture_name, declared_frame, 1
                    )),
                    hits == 0L,
                    !isNamespaceLoaded("declared")
                )
                restore()
            }
            stopifnot(
                is.null(runtime$workspace_restricted_variable(fixture_name, declared_frame, 1)),
                !isNamespaceLoaded("declared")
            )
        })
        assign(fixture_name, declared_frame, .GlobalEnv)
        restored_declared <- runtime$workspace_snapshot()
        stopifnot(
            restored_declared$variables[[1]]$has_viewer,
            length(restored_declared$datasetStates) == 1L
        )
        stopifnot(is.null(runtime$workspace_restricted_variable(
            fixture_name, declared_frame, 1
        )))
        fixtures <- c(fixtures, list(
            "format.declared" = declared_frame,
            "undeclare.declared" = declared_frame,
            "[.declared" = declared_frame,
            "is.na.declared" = declared_frame
        ))
        # DialogR/DialogQCA Variables-tab inference depends on the real declared
        # implementation when formal measurement metadata is absent.
        stopifnot(
            identical(runtime$workspace_dataset_measure(
                c("1", "2", "3"), NULL, NULL
            ), "interval"),
            identical(runtime$workspace_dataset_measure(
                c(1, 2, 3), NULL, NULL
            ), "interval"),
            identical(runtime$workspace_dataset_measure(
                factor(c("a", "b")), NULL, NULL
            ), "nominal"),
            identical(runtime$workspace_dataset_measure(
                ordered(c("a", "b")), NULL, NULL
            ), "ordinal")
        )
        fixtures <- c(fixtures, list(
            "undeclare.integer" = data.frame(value = 1:3),
            "undeclare.default" = data.frame(value = 1:3)
        ))
    }
    for (override_name in names(fixtures)) {
        stopifnot(!exists(override_name, .GlobalEnv, inherits = FALSE))
        assign(fixture_name, fixtures[[override_name]], .GlobalEnv)
        assign(override_name, hostile, .GlobalEnv)
        tryCatch({
            restricted <- runtime$workspace_snapshot()
            changed <- runtime$collect_workspace_update(
                runtime$workspace_state_from_snapshot(restricted)
            )
            stopifnot(
                identical(restricted$variables[[1]]$display_value, ""),
                identical(changed$state$variables[[fixture_name]]$display_value, ""),
                hits == 0L
            )
        }, finally = rm(list = override_name, envir = .GlobalEnv))
        stopifnot(is.null(runtime$workspace_restricted_variable(
            fixture_name, fixtures[[override_name]], 1
        )))
    }
    check_registered_method <- function(generic, class_name, value, package_name) {
        namespace <- asNamespace(package_name)
        table <- get(".__S3MethodsTable__.", namespace, inherits = FALSE)
        registered_name <- paste0(generic, ".", class_name)
        existed <- exists(registered_name, table, inherits = FALSE)
        original <- if (existed) get(registered_name, table, inherits = FALSE) else NULL
        restore <- function() {
            if (exists(registered_name, table, inherits = FALSE)) {
                rm(list = registered_name, envir = table)
            }
            if (existed) {
                assign(registered_name, original, envir = table)
            }
        }
        on.exit(restore(), add = TRUE)
        assign(fixture_name, value, .GlobalEnv)

        # No method binding is on the search path: this is a private registration.
        registration_scope <- new.env(parent = namespace)
        registerS3method(generic, class_name, hostile, envir = registration_scope)
        restricted <- runtime$workspace_snapshot()
        changed <- runtime$collect_workspace_update(
            runtime$workspace_state_from_snapshot(restricted)
        )
        stopifnot(
            identical(restricted$variables[[1]]$display_value, ""),
            identical(changed$state$variables[[fixture_name]]$display_value, ""),
            hits == 0L
        )

        rm(list = registered_name, envir = table)
        makeActiveBinding(registered_name, hostile, table)
        stopifnot(
            identical(runtime$workspace_snapshot()$variables[[1]]$display_value, ""),
            hits == 0L
        )

        restore()
        stopifnot(is.null(runtime$workspace_restricted_variable(fixture_name, value, 1)))

        # Namespace declarations can retain names on a scalar method string.
        if (is.function(get0(registered_name, namespace, inherits = FALSE))) {
            rm(list = registered_name, envir = table)
            local({
                method <- structure(registered_name, names = "")
                home <- namespace
                delayedAssign(
                    registered_name, get(method, envir = home),
                    assign.env = table
                )
                stopifnot(
                    runtime$runtime_registered_method_is_stock(
                        table, registered_name, namespace
                    ),
                    identical(runtime$runtime_binding_info(table, registered_name)$state, "delayed"),
                    hits == 0L
                )
            })
            restore()
        }

        # Named registration leaves a promise in the method table. Its private
        # lookup environment must be recognized without evaluating the lookup.
        registration_scope$private_method <- hostile
        registerS3method(generic, class_name, "private_method", envir = registration_scope)
        stopifnot(
            identical(runtime$workspace_snapshot()$variables[[1]]$display_value, ""),
            hits == 0L
        )

        # Even the stock expression/home/name cannot authorize a shadowed get.
        rm(list = registered_name, envir = table)
        local({
            method <- structure(registered_name, names = "")
            home <- namespace
            get <- hostile
            delayedAssign(registered_name, get(method, envir = home), assign.env = table)
            stopifnot(
                !runtime$runtime_registered_method_is_stock(table, registered_name, namespace),
                hits == 0L
            )
        })
        restore()
    }
    check_registered_method("as.character", "Date", as.Date("2026-09-29"), "base")
    check_registered_method("head", "Date", as.Date("2026-09-29"), "utils")
    check_registered_method("dim", "data.frame", frame, "base")
    # Date/POSIXct previews create POSIXlt intermediates before formatting.
    # The stored object's class alone does not describe all dispatched methods.
    check_registered_method("as.character", "POSIXlt", as.Date("2026-09-29"), "base")
    check_registered_method("as.character", "POSIXlt", as.POSIXct("2026-09-29", tz = "UTC"), "base")
    check_registered_method("units", "difftime", as.difftime(1, units = "days"), "base")
    # Group-generic members must be checked independently of Ops/Math/Summary.
    # These exercise private registrations, active bindings and named promises,
    # then require ordinary previews to become eligible after restoration.
    check_registered_method("+", "Date", as.Date("2026-09-29"), "base")
    check_registered_method("==", "factor", factor(c("a", "b")), "base")
    check_registered_method("round", "difftime", as.difftime(1, units = "days"), "base")
    check_registered_method("min", "POSIXct", as.POSIXct("2026-09-29", tz = "UTC"), "base")
    # These values have no explicit class attribute, but head uses S3 implicit
    # classes. Include a nested value and the numeric fallback of a matrix.
    check_registered_method("head", "integer", 1:3, "utils")
    check_registered_method("head", "numeric", c(1, 2, 3), "utils")
    check_registered_method("head", "list", list(1, 2), "utils")
    check_registered_method("head", "matrix", matrix(1:4, nrow = 2), "utils")
    check_registered_method("head", "array", array(1:8, dim = c(2, 2, 2)), "utils")
    check_registered_method("head", "numeric", matrix(1:4, nrow = 2), "utils")
    check_registered_method("head", "integer", list(column = 1:3), "utils")
    if (requireNamespace("declared", quietly = TRUE)) {
        check_registered_method("is.na", "declared", declared_frame, "base")
        check_registered_method("undeclare", "declared", declared_frame, "declared")
        check_registered_method(
            "undeclare", "integer", data.frame(value = 1:3), "declared"
        )
        check_registered_method(
            "undeclare", "default", data.frame(value = 1:3), "declared"
        )
    }
    check_registered_method("head", "default", 1:3, "utils")
    check_registered_method("format", "default", frame, "base")
    check_registered_method("str", "default", list(column = 1:3), "utils")

    # Global default-method bindings must be recognized without forcing them.
    # Default replacements affect the whole automatic view, including tables;
    # restoring the method must restore viewer eligibility and copy safety.
    local({
        assign(fixture_name, frame, .GlobalEnv)
        # Date columns deliberately do not qualify for the copy fast path.
        # Use an ordinary stored frame to test default-method recovery there.
        copy_frame <- data.frame(value = 1L)
        for (override_name in c("head.default", "format.default", "str.default")) {
            stopifnot(!exists(override_name, .GlobalEnv, inherits = FALSE))
            tryCatch({
                makeActiveBinding(override_name, hostile, .GlobalEnv)
                restricted <- runtime$workspace_snapshot()
                stopifnot(
                    identical(restricted$variables[[1]]$display_value, ""),
                    !restricted$variables[[1]]$has_viewer,
                    !runtime$workspace_copy_value_is_reusable(copy_frame),
                    hits == 0L
                )
                rm(list = override_name, envir = .GlobalEnv)
                delayedAssign(override_name, hostile(), assign.env = .GlobalEnv)
                changed <- runtime$collect_workspace_update(
                    runtime$workspace_state_from_snapshot(restricted)
                )
                stopifnot(
                    identical(changed$state$variables[[fixture_name]]$display_value, ""),
                    !changed$state$variables[[fixture_name]]$has_viewer,
                    hits == 0L
                )
            }, finally = rm(list = override_name, envir = .GlobalEnv))
            recovered <- runtime$collect_workspace_update(changed$state)
            stopifnot(
                recovered$state$variables[[fixture_name]]$has_viewer,
                identical(recovered$state$variables[[fixture_name]]$display_value, "1 x 1"),
                runtime$workspace_copy_value_is_reusable(copy_frame)
            )
        }
    })

    # Guard and reconciliation name bookkeeping must not dispatch unique
    # methods. These targeted checks are not complete snapshot acceptance.
    local({
        dependency_method <- "as.character.POSIXlt"
        stopifnot(!exists(dependency_method, .GlobalEnv, inherits = FALSE))
        assign(dependency_method, hostile, .GlobalEnv)
        on.exit(rm(list = dependency_method, envir = .GlobalEnv), add = TRUE)
        baseline <- runtime$workspace_overridden_inspection_classes()
        stopifnot(all(is.element(c("Date", "POSIXct", "POSIXt"), baseline)))
        check_guard <- function(class_name) {
            found <- runtime$workspace_overridden_inspection_classes()
            # unique.character itself is correctly reported as an override.
            expected <- c(baseline, class_name)
            stopifnot(
                all(is.element(expected, found)),
                all(is.element(found, expected)),
                !anyDuplicated(found),
                hits == 0L
            )
            stopifnot(
                identical(runtime$dataset_changed_columns(
                    c("a", "b"), c("b", "c", "c")
                ), c("a", "c")),
                identical(runtime$dataset_changed_columns(
                    c("a", "b"), c("b", "a")
                ), c("b", "a")),
                identical(runtime$dataset_changed_columns(
                    character(0), character(0)
                ), character(0))
            )
            previous <- list(
                columns = c("a", "b", "b"),
                columnHash = list(a = "old", b = "same"),
                columnMetaSig = list(a = "same", b = "old")
            )
            current <- list(
                columns = previous$columns,
                columnHash = list(a = "new", b = "same"),
                columnMetaSig = list(a = "same", b = "new")
            )
            stopifnot(
                identical(runtime$dataset_changed_value_columns(previous, current), "a"),
                identical(runtime$dataset_changed_variable_meta(previous, current), "b"),
                identical(runtime$workspace_copy_select_state(
                    list(vector = c("a", "a")), "a", "b"
                )$vector, c("a", "b"))
            )
            removed <- "DF_absent_bookkeeping_probe"
            stopifnot(!exists(removed, .GlobalEnv, inherits = FALSE))
            state <- list(
                signatures = setNames(list("old", "keep"), c(removed, fixture_name)),
                variables = setNames(list(list(), list()), c(removed, fixture_name)),
                datasetStates = setNames(list(list()), removed),
                select = list(vector = c(removed, fixture_name, fixture_name))
            )
            result <- runtime$workspace_remove_cached_state(state, c(removed, removed, ""))
            stopifnot(
                identical(result$update$removed, removed),
                identical(result$update$datasets$removed, removed),
                identical(names(result$state$variables), fixture_name),
                identical(result$state$select$vector, fixture_name),
                hits == 0L
            )
        }
        table <- get(".__S3MethodsTable__.", asNamespace("base"), inherits = FALSE)
        for (class_name in c("character", "default")) {
            override_name <- paste0("unique.", class_name)
            stopifnot(!exists(override_name, .GlobalEnv, inherits = FALSE))
            tryCatch({
                assign(override_name, hostile, .GlobalEnv)
                check_guard(class_name)
                rm(list = override_name, envir = .GlobalEnv)
                makeActiveBinding(override_name, hostile, .GlobalEnv)
                check_guard(class_name)
                rm(list = override_name, envir = .GlobalEnv)
                delayedAssign(override_name, hostile(), assign.env = .GlobalEnv)
                check_guard(class_name)
            }, finally = rm(list = override_name, envir = .GlobalEnv))

            existed <- exists(override_name, table, inherits = FALSE)
            original <- if (existed) get(override_name, table, inherits = FALSE) else NULL
            tryCatch({
                registerS3method("unique", class_name, hostile, envir = asNamespace("base"))
                check_guard(class_name)
                rm(list = override_name, envir = table)
                makeActiveBinding(override_name, hostile, table)
                check_guard(class_name)
                rm(list = override_name, envir = table)
                delayedAssign(override_name, hostile(), assign.env = table)
                check_guard(class_name)
            }, finally = {
                if (exists(override_name, table, inherits = FALSE)) {
                    rm(list = override_name, envir = table)
                }
                if (existed) {
                    assign(override_name, original, envir = table)
                }
            })
            stopifnot(identical(runtime$workspace_overridden_inspection_classes(), baseline))
        }
    })

    # Generated hash sums and JSON numbers must not select a workspace method,
    # even when the original object has already been restricted. Check the
    # fallback hash directly, independently of whether digest is installed.
    local({
        previous_options <- options(OutDec = ".")
        on.exit(options(previous_options), add = TRUE)
        bytes <- as.raw(c(1, 2, 255))
        expected_hash <- runtime$workspace_hash_raw(bytes)
        expected_numbers <- vapply(
            c(0, 1, -1.25, 0.125), runtime$json_num, character(1)
        )
        stopifnot(identical(expected_numbers, c("0", "1", "-1.25", "0.125")))
        check_numbers <- function() {
            stopifnot(
                identical(runtime$workspace_hash_raw(bytes), expected_hash),
                identical(vapply(
                    c(0, 1, -1.25, 0.125), runtime$json_num, character(1)
                ), expected_numbers),
                hits == 0L
            )
        }
        table <- get(".__S3MethodsTable__.", asNamespace("base"), inherits = FALSE)
        for (class_name in c("numeric", "double", "default")) {
            override_name <- paste0("format.", class_name)
            stopifnot(!exists(override_name, .GlobalEnv, inherits = FALSE))
            assign(override_name, hostile, .GlobalEnv)
            tryCatch(check_numbers(), finally = rm(list = override_name, envir = .GlobalEnv))

            existed <- exists(override_name, table, inherits = FALSE)
            original <- if (existed) get(override_name, table, inherits = FALSE) else NULL
            tryCatch({
                registerS3method("format", class_name, hostile, envir = asNamespace("base"))
                check_numbers()
                rm(list = override_name, envir = table)
                makeActiveBinding(override_name, hostile, table)
                check_numbers()
                rm(list = override_name, envir = table)
                delayedAssign(override_name, hostile(), assign.env = table)
                check_numbers()
            }, finally = {
                if (exists(override_name, table, inherits = FALSE)) {
                    rm(list = override_name, envir = table)
                }
                if (existed) {
                    assign(override_name, original, envir = table)
                }
            })
            check_numbers()
        }
    })

    # Timestamps, revision identities and object-size counts are generated by
    # DialogForge. User methods for their temporary classes must not run.
    local({
        check_internal_values <- function() {
            startup_runtime <- new.env(parent = globalenv())
            startup_runtime$opts <- list()
            sys.source(file.path(sources, "runtimePrelude.R"), startup_runtime)
            size <- runtime$workspace_object_size_bytes(1:3)
            timestamp <- runtime$runtime_time_ms()
            stopifnot(
                is.double(size), length(size) == 1L, size > 0,
                is.double(timestamp), length(timestamp) == 1L, timestamp > 0,
                is.character(startup_runtime$workspace_revision_session),
                length(startup_runtime$workspace_revision_session) == 1L,
                hits == 0L
            )
        }
        overrides <- c(
            "as.double.object_size", "as.numeric.object_size",
            "as.double.POSIXct", "as.numeric.POSIXct", "format.POSIXct"
        )
        for (override_name in overrides) {
            stopifnot(!exists(override_name, .GlobalEnv, inherits = FALSE))
            tryCatch({
                assign(override_name, hostile, .GlobalEnv)
                check_internal_values()
                rm(list = override_name, envir = .GlobalEnv)
                makeActiveBinding(override_name, hostile, .GlobalEnv)
                check_internal_values()
                rm(list = override_name, envir = .GlobalEnv)
                delayedAssign(override_name, hostile(), assign.env = .GlobalEnv)
                check_internal_values()
            }, finally = rm(list = override_name, envir = .GlobalEnv))
        }

        table <- get(".__S3MethodsTable__.", asNamespace("base"), inherits = FALSE)
        registrations <- list(
            c("as.double", "object_size"),
            c("as.double", "POSIXct"),
            c("format", "POSIXct")
        )
        for (registration in registrations) {
            generic <- registration[[1]]
            class_name <- registration[[2]]
            override_name <- paste0(generic, ".", class_name)
            existed <- exists(override_name, table, inherits = FALSE)
            original <- if (existed) get(override_name, table, inherits = FALSE) else NULL
            tryCatch({
                registerS3method(generic, class_name, hostile, envir = asNamespace("base"))
                check_internal_values()
            }, finally = {
                if (exists(override_name, table, inherits = FALSE)) {
                    rm(list = override_name, envir = table)
                }
                if (existed) {
                    assign(override_name, original, envir = table)
                }
            })
        }
    })

    rm(list = fixture_name, envir = .GlobalEnv)
    delayedAssign("DF_standard_method_probe", hostile(), assign.env = .GlobalEnv)
    lazy_snapshot <- runtime$workspace_snapshot()
    lazy_update <- runtime$collect_workspace_update(
        runtime$workspace_state_from_snapshot(lazy_snapshot)
    )
    stopifnot(
        identical(lazy_snapshot$variables[[1]]$display_type, "delayed binding"),
        identical(lazy_update$state$variables[[fixture_name]]$display_type, "delayed binding"),
        hits == 0L
    )
    assign(fixture_name, 42, .GlobalEnv)
    recovered <- runtime$collect_workspace_update(lazy_update$state)
    stopifnot(identical(recovered$state$variables[[fixture_name]]$display_value, "42"))
    cat("Search-path and direct-registration standard-method safety passed.\n")
})

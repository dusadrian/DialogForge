# Run only in a disposable R process. --tidyverse additionally checks the
# installed package from the reported workflow and fails if it is unavailable.
local({
    arguments <- commandArgs(trailingOnly = FALSE)
    script <- sub("^--file=", "", arguments[startsWith(arguments, "--file=")][[1L]])
    root <- dirname(dirname(normalizePath(script)))
    requested <- commandArgs(trailingOnly = TRUE)

    if (any(!is.element(requested, "--tidyverse"))) {
        stop("Only the optional --tidyverse acceptance argument is supported.")
    }

    sources <- file.path(root, "src/runtime/providers/r/r-sources")
    sys.source(file.path(sources, "runtimeInitialization.R"), envir = environment())
    runtime <- runtime_initialize_environment()
    runtime$runtime_inspection_library <- Sys.getenv(
        "DIALOGFORGE_TEST_INSPECTION_LIBRARY", unset = file.path(
            root, "vendor/r-runtime/native", paste(R.version$platform, getRversion(), sep = "-")
        )
    )

    for (name in c(runtime_control_source_names(), runtime_control_source_names("dispatch"))) {
        sys.source(file.path(sources, name), envir = runtime)
    }

    runtime_prepare_control_functions(runtime)
    fixture_name <- "DF_workspace_package_frame"
    stopifnot(!exists(fixture_name, envir = .GlobalEnv, inherits = FALSE))
    assign(fixture_name, data.frame(number = c(1L, 2L)), envir = .GlobalEnv)
    on.exit(rm(list = fixture_name, envir = .GlobalEnv), add = TRUE)
    runtime$runtime_commit_workspace_change(runtime$collect_workspace_update())

    run_workspace_command <- function(code, expected_reconciliation, id) {
        previous <- runtime$workspace_index_get("last_state")
        response <- runtime$runtime_evaluate_control_request(list(
            id = id,
            method = "execute_input",
            transportNonce = paste0(id, "-nonce"),
            params = list(code = code, parentId = id, mode = "interactive")
        ), collect_events = TRUE)
        events <- response$events_json
        state <- runtime$workspace_index_get("last_state")

        stopifnot(
            isTRUE(response$ok),
            grepl('"outcome":"success"', events, fixed = TRUE),
            grepl('"type":"completion"', events, fixed = TRUE),
            grepl(paste0(
                '"workspaceReconciliation":"', expected_reconciliation, '"'
            ), events, fixed = TRUE),
            !grepl("Workspace refresh failed", events, fixed = TRUE),
            !isTRUE(runtime$workspace_reconciliation_failed),
            identical(state$workspaceRevision$session, previous$workspaceRevision$session),
            identical(state$workspaceRevision$sequence, previous$workspaceRevision$sequence + 1),
            isTRUE(state$variables[[fixture_name]]$has_viewer)
        )

        if (identical(expected_reconciliation, "changed")) {
            stopifnot(grepl('"type":"workspace_update"', events, fixed = TRUE))
        }

        invisible(response)
    }

    namespace <- asNamespace("utils")
    declarations <- getNamespaceInfo(namespace, "S3methods")
    methods <- get(".__S3MethodsTable__.", envir = namespace, inherits = FALSE)
    registered_name <- "head.DFWorkspacePackageAttachment"
    stopifnot(!exists(registered_name, envir = methods, inherits = FALSE))
    on.exit({
        rm(list = registered_name, envir = methods)
        setNamespaceInfo(namespace, "S3methods", declarations)
    }, add = TRUE)

    # Registering a function dynamically is a legitimate package operation.
    # R changes utils' entire S3 declaration matrix to a list matrix, including
    # pre-existing cells such as the head.data.frame alias to head.array.
    run_workspace_command(paste0(
        'base::registerS3method("head", "DFWorkspacePackageAttachment", ',
        'function(x, ...) stop("The fixture method must not run"), ',
        'envir = asNamespace("utils"))'
    ), "unchanged", "register-package-method")
    stopifnot(identical(typeof(getNamespaceInfo(namespace, "S3methods")), "list"))
    stopifnot(runtime$runtime_registered_method_is_stock(
        methods, "head.data.frame", namespace
    ))

    run_workspace_command(
        "DF_workspace_package_frame$number[1L] <- 99L",
        "changed",
        "edit-after-package-registration"
    )
    stopifnot(identical(get(fixture_name, envir = .GlobalEnv)$number, c(99L, 2L)))

    # Valid declaration metadata must not make hostile method bindings trusted.
    # Neither active bindings nor unevaluated promises may execute in refresh.
    callbacks <- 0L
    hostile <- function(...) {
        callbacks <<- callbacks + 1L
        stop("Workspace inspection invoked a method binding")
    }
    untrusted_methods <- new.env(parent = emptyenv())
    makeActiveBinding("head.data.frame", hostile, untrusted_methods)
    stopifnot(!runtime$runtime_registered_method_is_stock(
        untrusted_methods, "head.data.frame", namespace
    ))
    rm(list = "head.data.frame", envir = untrusted_methods)
    delayedAssign("head.data.frame", hostile(), assign.env = untrusted_methods)
    stopifnot(
        !runtime$runtime_registered_method_is_stock(
            untrusted_methods, "head.data.frame", namespace
        ),
        identical(callbacks, 0L)
    )

    if (is.element("--tidyverse", requested)) {
        if (!requireNamespace("tidyverse", quietly = TRUE)) {
            stop("--tidyverse requires an installed tidyverse package.")
        }

        run_workspace_command("library(tidyverse)", "unchanged", "attach-tidyverse")
        run_workspace_command(
            "DF_workspace_package_frame$number[2L] <- 100L",
            "changed",
            "edit-after-tidyverse"
        )
        stopifnot(identical(get(fixture_name, envir = .GlobalEnv)$number, c(99L, 100L)))
        cat("Actual tidyverse attachment and subsequent workspace edit passed.\n")
    }

    cat("Package S3 registration, workspace completion and method-binding safety passed.\n")
})

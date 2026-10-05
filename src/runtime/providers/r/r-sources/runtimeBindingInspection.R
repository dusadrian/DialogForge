runtime_binding_info <- local({
    runtime_inspection_library <- get0(
        "runtime_inspection_library", envir = parent.env(environment()),
        inherits = FALSE, ifnotfound = ""
    )
    if (!nzchar(runtime_inspection_library)) {
        root <- Sys.getenv("DM_RUNTIME_INSPECTION_ROOT", unset = "")
        runtime_inspection_library <- if (nzchar(root)) {
            file.path(root, paste(R.version$platform, getRversion(), sep = "-"))
        }
        else {
            ""
        }
    }
    if (!nzchar(runtime_inspection_library)) {
        stop("DialogForge binding-inspection library is not configured.")
    }
    namespace <- tryCatch(
        loadNamespace("dialogforgeinspect", lib.loc = runtime_inspection_library),
        error = function(error) {
            stop(paste0(
                "DialogForge binding-inspection helper could not be loaded from ",
                runtime_inspection_library, ". Build the helper for this R runtime. ",
                conditionMessage(error)
            ), call. = FALSE)
        }
    )
    if (!identical(as.character(getNamespaceVersion(namespace)), "0.4.3")) {
        stop("DialogForge binding-inspection helper version mismatch; rebuild the helper.")
    }
    get("binding_info", envir = namespace, inherits = FALSE)
})

runtime_stored_graph_is_inspectable <- get(
    "stored_graph_is_inspectable", envir = asNamespace("dialogforgeinspect"),
    inherits = FALSE
)

runtime_control_closure_is_compiled <- get(
    "closure_is_compiled", envir = asNamespace("dialogforgeinspect"),
    inherits = FALSE
)

runtime_rebind_compiled_control_closure <- get(
    "rebind_compiled_closure", envir = asNamespace("dialogforgeinspect"),
    inherits = FALSE
)

runtime_stored_list_fields <- get(
    "stored_list_fields", envir = asNamespace("dialogforgeinspect"),
    inherits = FALSE
)

runtime_observe_graphics_device <- get(
    "observe_graphics_device", envir = asNamespace("dialogforgeinspect"),
    inherits = FALSE
)

runtime_graphics_device_is_current <- get(
    "graphics_device_is_current", envir = asNamespace("dialogforgeinspect"),
    inherits = FALSE
)

runtime_graphics_device_is_open <- get(
    "graphics_device_is_open", envir = asNamespace("dialogforgeinspect"),
    inherits = FALSE
)

runtime_match_stored_names <- get(
    "match_stored_names", envir = asNamespace("dialogforgeinspect"),
    inherits = FALSE
)


runtime_inspection_names_contain <- function(values, choices) {
    runtime_match_stored_names(values, choices) > 0L
}


runtime_inspection_declared_namespace <- local({
    # S3 registrations can outlive namespace unload. Remember the genuine
    # registered namespace before it disappears, not a method's claimed home
    # or an attached environment's display name. This never loads declared.
    hook_name <- base::packageEvent("declared", "onUnload")
    hooks <- base::getHook(hook_name)
    retained <- new.env(parent = emptyenv())
    retained$namespace <- NULL
    other_hooks <- list()

    for (hook in hooks) {
        cache <- attr(hook, "dialogforge_inspection_declared_cache", exact = TRUE)
        if (is.environment(cache)) {
            # Re-sourcing the canonical helper replaces its observer rather
            # than accumulating callbacks or losing already retained identity.
            retained <- cache
        }
        else {
            other_hooks[[length(other_hooks) + 1L]] <- hook
        }
    }

    registered <- base::.getNamespace("declared")
    if (is.environment(registered)) {
        retained$namespace <- registered
    }
    remember_unloaded_namespace <- function(...) {
        registered <- base::.getNamespace("declared")
        if (is.environment(registered)) {
            # Resolve stock function definitions while their namespace is
            # still registered. Deferring lazy-load resolution until a later
            # safety scan could reload the namespace just to restore closure
            # environments. No method is called and no S3 table is evaluated.
            declarations <- base::getNamespaceInfo(registered, "S3methods")
            for (name in base::unique.default(declarations[, 3L])) {
                get0(name, envir = registered, inherits = FALSE)
            }
            retained$namespace <- registered
        }
        invisible(NULL)
    }
    remember_unloaded_namespace <- compiler::cmpfun(remember_unloaded_namespace)
    attr(remember_unloaded_namespace, "dialogforge_inspection_declared_cache") <- retained
    base::setHook(hook_name, c(other_hooks, list(remember_unloaded_namespace)), "replace")

    compiler::cmpfun(function() {
        registered <- base::.getNamespace("declared")
        if (is.environment(registered)) {
            retained$namespace <- registered
        }
        retained$namespace
    })
})


runtime_registered_method_is_stock <- function(methods, name, namespace) {
    stock_name <- name
    if (!identical(namespace, asNamespace("base"))) {
        declarations <- getNamespaceInfo(namespace, "S3methods")
        declared_names <- paste(declarations[, 1L], declarations[, 2L], sep = ".")
        declaration <- runtime_match_stored_names(name, declared_names)
        if (declaration > 0L) {
            stock_name <- declarations[declaration, 3L]
        }
    }
    binding <- runtime_binding_info(methods, name)
    if (runtime_inspection_names_contain(binding$state, c("value", "forced"))) {
        stock <- get0(stock_name, envir = namespace, inherits = FALSE)
        return(is.function(stock) && identical(binding$value, stock))
    }
    if (identical(binding$state, "delayed")) {
        stock_binding <- runtime_binding_info(namespace, stock_name)
        if (
            identical(stock_binding$state, "delayed") &&
            identical(binding$expression, stock_binding$expression) &&
            identical(binding$environment, stock_binding$environment)
        ) {
            # Stock namespaces can share their lazy-load binding with the S3
            # table directly. Match provenance, not just the expression text.
            return(TRUE)
        }
    }
    if (
        !identical(binding$state, "delayed") ||
        !identical(binding$expression, quote(get(method, envir = home))) ||
        !is.environment(binding$environment)
    ) {
        return(FALSE)
    }

    context <- binding$environment
    method <- runtime_binding_info(context, "method")
    home <- runtime_binding_info(context, "home")
    if (
        !runtime_inspection_names_contain(method$state, c("value", "forced")) ||
        !runtime_inspection_names_contain(home$state, c("value", "forced")) ||
        !is.environment(home$value)
    ) {
        return(FALSE)
    }

    if (!identical(home$value, namespace)) {
        # Lazy-load restoration can give a stock closure a separate namespace
        # home after unload. Accept only an already stored identical stock
        # function there, never a namespace name or a promise to retrieve it.
        stock <- get0(stock_name, envir = namespace, inherits = FALSE)
        home_binding <- runtime_binding_info(home$value, stock_name)
        if (
            !is.function(stock) ||
            !runtime_inspection_names_contain(home_binding$state, c("value", "forced")) ||
            !identical(home_binding$value, stock)
        ) {
            return(FALSE)
        }
    }

    # Named S3 declarations can retain a names attribute on the stored method
    # string. get() uses its scalar text, not that attribute. Inspect only an
    # ordinary stored character value, without forcing or dispatching methods.
    if (
        !runtime_stored_graph_is_inspectable(method$value) ||
        typeof(method$value) != "character" ||
        is.object(method$value) ||
        length(method$value) != 1L ||
        !identical(.subset2(method$value, 1L), stock_name)
    ) {
        return(FALSE)
    }

    # An identical expression is insufficient if its environment shadows get().
    stock_get <- base::get
    for (depth in seq_len(32L)) {
        resolver <- runtime_binding_info(context, "get")
        if (!identical(resolver$state, "unbound")) {
            return(
                runtime_inspection_names_contain(resolver$state, c("value", "forced")) &&
                identical(resolver$value, stock_get) &&
                is.function(get0(stock_name, envir = namespace, inherits = FALSE))
            )
        }
        if (identical(context, emptyenv())) {
            break
        }
        context <- parent.env(context)
    }
    FALSE
}

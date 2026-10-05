library(dialogforgeruntime)

local({
    bindings <- new.env(parent = baseenv())
    hits <- 0L
    makeActiveBinding("active", function() {
        hits <<- hits + 1L
        stop("Active binding invoked")
    }, bindings)
    delayedAssign("lazy", {
        hits <<- hits + 1L
        stop("Promise forced")
    }, assign.env = bindings)
    bindings$value <- list(x = 1)
    bindings$null <- NULL

    stopifnot(
        identical(binding_info(bindings, "active")$state, "active"),
        identical(binding_info(bindings, "lazy")$state, "delayed"),
        identical(binding_info(bindings, "absent")$state, "unbound"),
        identical(binding_info(bindings, "null")$state, "value"),
        identical(binding_info(bindings, "value")$value, list(x = 1)),
        identical(binding_info(bindings, "mean")$state, "unbound"),
        hits == 0L
    )

    delayedAssign("forced", 42, assign.env = bindings)
    invisible(bindings$forced)
    stopifnot(
        identical(binding_info(bindings, "forced")$state, "forced"),
        identical(binding_info(bindings, "forced")$value, 42)
    )
    missing_state <- function(argument) binding_info(environment(), "argument")$state
    stopifnot(identical(missing_state(), "missing"))

    # Identical lookup expressions need distinct, inspectable provenance.
    register_lookup <- function(home, name) {
        home <- home
        method <- "as.character.Date"
        delayedAssign(name, get(method, envir = home), assign.env = bindings)
    }
    private <- new.env(parent = emptyenv())
    makeActiveBinding("as.character.Date", function() {
        hits <<- hits + 1L
        stop("Private method lookup evaluated")
    }, private)
    register_lookup(asNamespace("base"), "stock")
    register_lookup(private, "custom")
    stock <- binding_info(bindings, "stock")
    custom <- binding_info(bindings, "custom")
    stopifnot(
        identical(stock$expression, custom$expression),
        identical(binding_info(stock$environment, "home")$value, asNamespace("base")),
        identical(binding_info(custom$environment, "home")$value, private),
        identical(binding_info(private, "as.character.Date")$state, "active"),
        hits == 0L
    )

    # Bytecode must survive rebinding without reading either environment.
    definition <- eval(parse(text = paste0(
        "function(x) {\n",
        "    inner <- function(y) length(y) + offset\n",
        "    inner(x)\n",
        "}"
    ), keep.source = TRUE)[[1L]], envir = bindings)
    template <- compiler::cmpfun(definition)
    home <- new.env(parent = baseenv())
    home$offset <- 3L
    home$length <- function(x) 7L
    makeActiveBinding("unused", function() {
        hits <<- hits + 1L
        stop("Compiled closure rebinding read an environment binding")
    }, home)
    rebound <- rebind_compiled_closure(template, home, definition)
    stopifnot(
        closure_is_compiled(template), closure_is_compiled(rebound),
        identical(environment(template), bindings),
        identical(environment(rebound), home),
        identical(attributes(rebound), attributes(definition)),
        identical(rebound(1:3), 10L), hits == 0L,
        !closure_is_compiled(sum), !closure_is_compiled(NULL),
        !closure_is_compiled(eval(parse(text = "function() NULL")[[1L]], baseenv()))
    )
    uncompiled <- eval(parse(text = "function() stop('must not execute')")[[1L]], baseenv())
    stopifnot(isTRUE(tryCatch({
        rebind_compiled_closure(uncompiled, home)
        FALSE
    }, error = function(error) TRUE)))
    ordinary_rebind <- template
    environment(ordinary_rebind) <- home
    stopifnot(!closure_is_compiled(ordinary_rebind), closure_is_compiled(template))

    stored <- list(alpha = function() stop("member invoked"), nested = list(value = 42L))
    shallow <- stored_list_fields(stored)
    nested <- stored_list_fields(stored, "nested")
    stopifnot(
        shallow$inspectable, identical(shallow$names, c("alpha", "nested")),
        identical(shallow$classes, "list"), is.null(shallow$value),
        identical(nested$value$value, 42L),
        is.function(stored_list_fields(stored, "alpha")$value),
        is.null(stored_list_fields(stored, "absent")$value),
        hits == 0L
    )
    for (opaque in list(
        structure(stored, class = "untrusted"),
        as.character(1:2), new.env(), function() NULL,
        rep(list(1L), 4097L)
    )) {
        stopifnot(!stored_list_fields(opaque)$inspectable)
    }
    # Source names can carry attributes; returned names must be plain strings.
    named <- list(alpha = 1L)
    attr(attr(named, "names"), "class") <- "untrusted_names"
    stopifnot(identical(stored_list_fields(named)$names, "alpha"))
    table <- data.frame(alpha = 1:2, beta = 3:4)
    stopifnot(
        identical(stored_list_fields(table)$classes, "data.frame"),
        identical(stored_list_fields(table)$names, c("alpha", "beta")),
        identical(stored_list_fields(table, "beta")$value, 3:4)
    )
    # Class must be found regardless of preceding unrelated stored metadata.
    earlier_metadata <- structure(list(alpha = 1L), metadata = list(42L), class = "data.frame")
    stopifnot(identical(stored_list_fields(earlier_metadata)$classes, "data.frame"))
    duplicate_names <- list(1L, 2L, 3L)
    names(duplicate_names) <- c("alpha", "alpha", NA_character_)
    stopifnot(
        identical(stored_list_fields(duplicate_names, "alpha")$value, 1L),
        is.null(stored_list_fields(duplicate_names, "absent")$value),
        stored_list_fields(list())$inspectable,
        identical(stored_list_fields(unname(list(1L)))$names, character(0))
    )
    for (invalid_name in list(1L, NA_character_, character(0), c("a", "b"))) {
        stopifnot(isTRUE(tryCatch({
            stored_list_fields(stored, invalid_name)
            FALSE
        }, error = function(error) TRUE)))
    }
    cat("Non-evaluating binding inspection passed.\n")
})

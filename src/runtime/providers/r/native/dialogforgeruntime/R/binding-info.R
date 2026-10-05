binding_info <- function(environment, name) {
    .Call(C_df_binding_info, environment, name)
}

closure_is_compiled <- function(value) {
    .Call(C_df_closure_is_compiled, value)
}

rebind_compiled_closure <- function(value, environment, original = value) {
    .Call(C_df_rebind_compiled_closure, value, environment, original)
}

stored_list_fields <- function(value, name = NULL) {
    .Call(C_df_stored_list_fields, value, name)
}

observe_graphics_device <- function(which) {
    .Call(C_df_observe_graphics_device, as.integer(which))
}

graphics_device_is_current <- function(token, which) {
    .Call(C_df_graphics_device_is_current, token, as.integer(which))
}

graphics_device_is_open <- function(token, which) {
    .Call(C_df_graphics_device_is_open, token, as.integer(which))
}

match_stored_names <- function(values, choices) {
    .Call(C_df_match_stored_names, values, choices)
}


stored_graph_is_inspectable <- local({
    integer_sequence <- 1:10000
    real_sequence <- 2147483648:2147493647
    integer_wrapper <- integer_sequence
    real_wrapper <- real_sequence
    attr(integer_wrapper, "label") <- "Inspection prototype"
    attr(real_wrapper, "label") <- "Inspection prototype"
    function(value) {
        .Call(
            C_df_stored_graph_is_inspectable, value,
            integer_sequence, real_sequence, integer_wrapper, real_wrapper
        )
    }
})

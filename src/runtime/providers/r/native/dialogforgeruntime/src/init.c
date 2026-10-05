#define R_NO_REMAP
#include <R.h>
#include <Rinternals.h>
#include <R_ext/Rdynload.h>
#include <R_ext/Visibility.h>

extern SEXP df_binding_info(SEXP, SEXP);
extern SEXP df_stored_graph_is_inspectable(SEXP, SEXP, SEXP, SEXP, SEXP);
extern SEXP df_closure_is_compiled(SEXP);
extern SEXP df_rebind_compiled_closure(SEXP, SEXP, SEXP);
extern SEXP df_stored_list_fields(SEXP, SEXP);
extern SEXP df_observe_graphics_device(SEXP);
extern SEXP df_graphics_device_is_current(SEXP, SEXP);
extern SEXP df_graphics_device_is_open(SEXP, SEXP);
extern SEXP df_match_stored_names(SEXP, SEXP);
extern SEXP df_read_bounded_request(SEXP, SEXP);
extern SEXP df_write_runtime_frame(SEXP, SEXP);
extern SEXP df_read_runtime_console_line(SEXP, SEXP, SEXP);
extern SEXP df_with_runtime_console_input(SEXP, SEXP);
extern SEXP df_output_open(SEXP);
extern SEXP df_output_seal(SEXP);
extern SEXP df_output_abort(SEXP);

static const R_CallMethodDef call_methods[] = {
    {"df_binding_info", (DL_FUNC) &df_binding_info, 2},
    {"df_stored_graph_is_inspectable", (DL_FUNC) &df_stored_graph_is_inspectable, 5},
    {"df_closure_is_compiled", (DL_FUNC) &df_closure_is_compiled, 1},
    {"df_rebind_compiled_closure", (DL_FUNC) &df_rebind_compiled_closure, 3},
    {"df_stored_list_fields", (DL_FUNC) &df_stored_list_fields, 2},
    {"df_observe_graphics_device", (DL_FUNC) &df_observe_graphics_device, 1},
    {"df_graphics_device_is_current", (DL_FUNC) &df_graphics_device_is_current, 2},
    {"df_graphics_device_is_open", (DL_FUNC) &df_graphics_device_is_open, 2},
    {"df_match_stored_names", (DL_FUNC) &df_match_stored_names, 2},
    {"df_read_bounded_request", (DL_FUNC) &df_read_bounded_request, 2},
    {"df_write_runtime_frame", (DL_FUNC) &df_write_runtime_frame, 2},
    {"df_read_runtime_console_line", (DL_FUNC) &df_read_runtime_console_line, 3},
    {"df_with_runtime_console_input", (DL_FUNC) &df_with_runtime_console_input, 2},
    {"df_output_open", (DL_FUNC) &df_output_open, 1},
    {"df_output_seal", (DL_FUNC) &df_output_seal, 1},
    {"df_output_abort", (DL_FUNC) &df_output_abort, 1},
    {NULL, NULL, 0}
};

void attribute_visible R_init_dialogforgeruntime(DllInfo *dll)
{
    R_registerRoutines(dll, NULL, call_methods, NULL, NULL);
    R_useDynamicSymbols(dll, FALSE);
    R_forceSymbols(dll, TRUE);
}

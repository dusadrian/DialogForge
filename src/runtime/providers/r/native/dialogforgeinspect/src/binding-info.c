#define R_NO_REMAP
#include <R.h>
#include <Rinternals.h>
#include <Rversion.h>
#include <R_ext/Rdynload.h>
#include <R_ext/Visibility.h>

/* Internal class/method names are ordinary strings. Match them through R's
 * public native API without package replacements of base::match/is.element. */
static SEXP df_match_stored_names(SEXP values, SEXP choices)
{
    if (TYPEOF(values) != STRSXP || TYPEOF(choices) != STRSXP ||
        ALTREP(values) || ALTREP(choices) || Rf_isObject(values) || Rf_isObject(choices)) {
        Rf_error("Inspection matching requires ordinary character names.");
    }
    return Rf_match(choices, values, 0);
}

/* Read only the named frame. Never look through a parent or evaluate a binding. */
static SEXP df_binding_info(SEXP environment, SEXP name)
{
    if (TYPEOF(environment) != ENVSXP) {
        Rf_error("Binding inspection requires an environment.");
    }
    if (TYPEOF(name) != STRSXP || ALTREP(name) || XLENGTH(name) != 1 ||
        STRING_ELT(name, 0) == NA_STRING) {
        Rf_error("Binding inspection requires one ordinary, non-missing name.");
    }

    SEXP symbol = Rf_installChar(STRING_ELT(name, 0));
    SEXP result = PROTECT(Rf_allocVector(VECSXP, 4));
    SEXP names = PROTECT(Rf_allocVector(STRSXP, 4));
    const char *fields[] = {"state", "value", "expression", "environment"};
    for (int index = 0; index < 4; index++) {
        SET_STRING_ELT(names, index, Rf_mkChar(fields[index]));
    }
    Rf_setAttrib(result, R_NamesSymbol, names);
    const char *state = "unbound";

#if R_VERSION >= R_Version(4, 6, 0)
    R_BindingType_t type = R_GetBindingType(symbol, environment);
    switch (type) {
        case R_BindingTypeValue:
        case R_BindingTypeForced:
            state = type == R_BindingTypeForced ? "forced" : "value";
            SET_VECTOR_ELT(result, 1, R_getVar(symbol, environment, FALSE));
            break;
        case R_BindingTypeDelayed:
            state = "delayed";
            SET_VECTOR_ELT(result, 2, R_DelayedBindingExpression(symbol, environment));
            SET_VECTOR_ELT(result, 3, R_DelayedBindingEnvironment(symbol, environment));
            break;
        case R_BindingTypeActive:
            state = "active";
            break;
        case R_BindingTypeMissing:
            state = "missing";
            break;
        case R_BindingTypeUnbound:
            break;
        default:
            Rf_error("Unsupported R binding type.");
    }
#else
    /* R 4.5 exposes promise accessors; keep this compatibility path isolated. */
    if (R_existsVarInFrame(environment, symbol)) {
        if (R_BindingIsActive(symbol, environment)) {
            state = "active";
        }
        else {
            SEXP value = Rf_findVarInFrame(environment, symbol);
            if (value == R_MissingArg) {
                state = "missing";
            }
            else if (TYPEOF(value) == PROMSXP) {
                if (PRVALUE(value) == R_UnboundValue) {
                    state = "delayed";
                    SET_VECTOR_ELT(result, 2, PREXPR(value));
                    SET_VECTOR_ELT(result, 3, PRENV(value));
                }
                else {
                    state = "forced";
                    SET_VECTOR_ELT(result, 1, PRVALUE(value));
                }
            }
            else {
                state = "value";
                SET_VECTOR_ELT(result, 1, value);
            }
        }
    }
#endif

    SET_VECTOR_ELT(result, 0, Rf_mkString(state));
    UNPROTECT(2);
    return result;
}

extern SEXP df_stored_graph_is_inspectable(SEXP, SEXP, SEXP, SEXP, SEXP);
extern SEXP df_stored_list_fields(SEXP, SEXP);
extern SEXP df_observe_graphics_device(SEXP);
extern SEXP df_graphics_device_is_current(SEXP, SEXP);
extern SEXP df_graphics_device_is_open(SEXP, SEXP);

static SEXP df_closure_is_compiled(SEXP value)
{
    if (TYPEOF(value) != CLOSXP) {
        return Rf_ScalarLogical(FALSE);
    }
#if R_VERSION >= R_Version(4, 6, 0)
    return Rf_ScalarLogical(TYPEOF(R_ClosureBody(value)) == BCODESXP);
#else
    return Rf_ScalarLogical(TYPEOF(BODY(value)) == BCODESXP);
#endif
}

static SEXP df_rebind_compiled_closure(SEXP value, SEXP environment, SEXP original)
{
    if (TYPEOF(value) != CLOSXP || TYPEOF(environment) != ENVSXP || TYPEOF(original) != CLOSXP) {
        Rf_error("Compiled closure rebinding requires a closure and an environment.");
    }
#if R_VERSION >= R_Version(4, 6, 0)
    if (TYPEOF(R_ClosureBody(value)) != BCODESXP) {
        Rf_error("Cannot reuse an uncompiled control closure.");
    }
    SEXP result = PROTECT(R_mkClosure(
        R_ClosureFormals(value), R_ClosureBody(value), environment
    ));
#else
    if (TYPEOF(BODY(value)) != BCODESXP) {
        Rf_error("Cannot reuse an uncompiled control closure.");
    }
    SEXP result = PROTECT(Rf_duplicate(value));
    SET_CLOENV(result, environment);
#endif
    DUPLICATE_ATTRIB(result, original);
    UNPROTECT(1);
    return result;
}

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
    {NULL, NULL, 0}
};

void attribute_visible R_init_dialogforgeinspect(DllInfo *dll)
{
    R_registerRoutines(dll, NULL, call_methods, NULL, NULL);
    R_useDynamicSymbols(dll, FALSE);
    R_forceSymbols(dll, TRUE);
}

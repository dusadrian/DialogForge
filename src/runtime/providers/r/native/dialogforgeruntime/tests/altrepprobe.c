/* Test-only DLL: compile separately, never link into the production helper. */
#define R_NO_REMAP
#include <R.h>
#include <Rinternals.h>
#include <R_ext/Altrep.h>
#include <R_ext/Rdynload.h>
#include <R_ext/Visibility.h>

static R_altrep_class_t probe_class;
static int callbacks = 0;

static R_xlen_t probe_length(SEXP value)
{
    callbacks++;
    return 3;
}

static int probe_element(SEXP value, R_xlen_t index)
{
    callbacks++;
    return (int) index + 1;
}

static SEXP probe_serialized_state(SEXP value)
{
    callbacks++;
    return Rf_ScalarInteger(3);
}

static SEXP make_probe(void)
{
    return R_new_altrep(probe_class, R_NilValue, R_NilValue);
}

static SEXP callback_count(void)
{
    return Rf_ScalarInteger(callbacks);
}

/* A genuine stock wrapper with a foreign backing value must remain opaque.
   Do not invoke any of the wrapper/probe's callbacks while constructing it. */
static SEXP make_wrapped_probe(SEXP template)
{
    if (!ALTREP(template) || TYPEOF(template) != INTSXP) {
        Rf_error("Supply an integer wrapper created by base R.");
    }
    R_altrep_class_t wrapper_class = R_SUBTYPE_INIT(ALTREP_CLASS(template));
    SEXP probe = PROTECT(make_probe());
    SEXP wrapper = PROTECT(R_new_altrep(wrapper_class, probe, R_NilValue));
    UNPROTECT(2);
    return wrapper;
}

static const R_CallMethodDef methods[] = {
    {"make_probe", (DL_FUNC) &make_probe, 0},
    {"callback_count", (DL_FUNC) &callback_count, 0},
    {"make_wrapped_probe", (DL_FUNC) &make_wrapped_probe, 1},
    {NULL, NULL, 0}
};

void attribute_visible R_init_altrepprobe(DllInfo *dll)
{
    probe_class = R_make_altinteger_class("inspection_probe", "altrepprobe", dll);
    R_set_altrep_Length_method(probe_class, probe_length);
    R_set_altinteger_Elt_method(probe_class, probe_element);
    R_set_altrep_Serialized_state_method(probe_class, probe_serialized_state);
    R_registerRoutines(dll, NULL, methods, NULL, NULL);
    R_useDynamicSymbols(dll, FALSE);
    R_forceSymbols(dll, TRUE);
}

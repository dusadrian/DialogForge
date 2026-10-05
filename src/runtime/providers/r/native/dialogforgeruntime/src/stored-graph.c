#define R_NO_REMAP
#include <R.h>
#include <Rinternals.h>
#include <Rversion.h>

typedef struct {
    SEXP integer_sequence;
    SEXP real_sequence;
    SEXP deferred_string;
    SEXP integer_wrapper;
    SEXP real_wrapper;
    int remaining;
    int depth;
    int safe;
} InspectionGraph;

static int inspect_stored_graph(SEXP value, InspectionGraph *graph);

#if R_VERSION >= R_Version(4, 6, 0)
static SEXP inspect_attribute(SEXP name, SEXP value, void *data)
{
    InspectionGraph *graph = data;
    if (!inspect_stored_graph(value, graph)) {
        graph->safe = 0;
        return R_NilValue;
    }
    return NULL;
}
#endif

static int inspect_stored_graph(SEXP value, InspectionGraph *graph)
{
    if (--graph->remaining < 0 || graph->depth >= 64) {
        return 0;
    }
    if (ALTREP(value)) {
        SEXP class = ALTREP_CLASS(value);
        if (class != graph->integer_sequence && class != graph->real_sequence &&
            class != graph->deferred_string && class != graph->integer_wrapper &&
            class != graph->real_wrapper) {
            return 0;
        }
        /* Even a stock representation can wrap callback-backed contents. */
        graph->depth++;
        int safe = inspect_stored_graph(R_altrep_data1(value), graph) &&
            inspect_stored_graph(R_altrep_data2(value), graph);
        graph->depth--;
        if (!safe) {
            return 0;
        }
    }

    graph->depth++;
#if R_VERSION >= R_Version(4, 6, 0)
    R_mapAttrib(value, inspect_attribute, graph);
    if (!graph->safe) {
        graph->depth--;
        return 0;
    }
#else
    for (SEXP attribute = ATTRIB(value); attribute != R_NilValue; attribute = CDR(attribute)) {
        if (!inspect_stored_graph(CAR(attribute), graph)) {
            graph->depth--;
            return 0;
        }
    }
#endif

    int safe = 1;
    if (!ALTREP(value) && TYPEOF(value) == VECSXP) {
        R_xlen_t length = XLENGTH(value);
        if (length > graph->remaining) {
            safe = 0;
        }
        for (R_xlen_t index = 0; safe && index < length; index++) {
            safe = inspect_stored_graph(VECTOR_ELT(value, index), graph);
        }
    }
    else if (TYPEOF(value) == LISTSXP) {
        safe = inspect_stored_graph(CAR(value), graph) &&
            inspect_stored_graph(CDR(value), graph);
    }
    else if (TYPEOF(value) != NILSXP && TYPEOF(value) != LGLSXP &&
        TYPEOF(value) != INTSXP && TYPEOF(value) != REALSXP &&
        TYPEOF(value) != CPLXSXP && TYPEOF(value) != STRSXP &&
        TYPEOF(value) != RAWSXP && TYPEOF(value) != VECSXP) {
        safe = 0;
    }
    graph->depth--;
    return safe;
}

SEXP df_stored_graph_is_inspectable(
    SEXP value, SEXP integer_sequence, SEXP real_sequence,
    SEXP integer_wrapper, SEXP real_wrapper
)
{
    /* Prototypes are created in the package namespace from base R sequences.
       Do not trust an ALTREP class name or a claimed package name. */
    if (!ALTREP(integer_sequence) || !ALTREP(real_sequence)) {
        return Rf_ScalarLogical(0);
    }
    SEXP strings = PROTECT(Rf_coerceVector(integer_sequence, STRSXP));
    InspectionGraph graph = {
        ALTREP_CLASS(integer_sequence), ALTREP_CLASS(real_sequence),
        ALTREP(strings) ? ALTREP_CLASS(strings) : R_NilValue,
        ALTREP(integer_wrapper) ? ALTREP_CLASS(integer_wrapper) : R_NilValue,
        ALTREP(real_wrapper) ? ALTREP_CLASS(real_wrapper) : R_NilValue,
        4096, 0, 1
    };
    int safe = inspect_stored_graph(value, &graph);
    UNPROTECT(1);
    return Rf_ScalarLogical(safe);
}

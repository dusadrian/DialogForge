#define R_NO_REMAP
#include <R.h>
#include <Rinternals.h>
#include <Rversion.h>
#include <string.h>

typedef struct {
    SEXP names;
    SEXP classes;
} StoredListAttributes;

#if R_VERSION >= R_Version(4, 6, 0)
static SEXP read_stored_list_attribute(SEXP name, SEXP value, void *data)
{
    StoredListAttributes *attributes = data;
    if (name == R_NamesSymbol) {
        attributes->names = value;
    }
    else if (name == R_ClassSymbol) {
        attributes->classes = value;
    }
    return NULL;
}
#endif

/* Shallow member discovery. Never dispatch names/[[ methods or visit contents. */
SEXP df_stored_list_fields(SEXP value, SEXP name)
{
    SEXP result = PROTECT(Rf_allocVector(VECSXP, 4));
    SEXP fields = PROTECT(Rf_allocVector(STRSXP, 4));
    const char *labels[] = {"inspectable", "names", "classes", "value"};
    for (int index = 0; index < 4; index++) {
        SET_STRING_ELT(fields, index, Rf_mkChar(labels[index]));
    }
    Rf_setAttrib(result, R_NamesSymbol, fields);
    SET_VECTOR_ELT(result, 0, Rf_ScalarLogical(FALSE));
    SET_VECTOR_ELT(result, 1, Rf_allocVector(STRSXP, 0));
    SET_VECTOR_ELT(result, 2, Rf_allocVector(STRSXP, 0));

    if (TYPEOF(value) != VECSXP || ALTREP(value) || Rf_isS4(value)) {
        UNPROTECT(2);
        return result;
    }
    R_xlen_t count = XLENGTH(value);
    if (count > 4096) {
        UNPROTECT(2);
        return result;
    }
    StoredListAttributes attributes = { R_NilValue, R_NilValue };
#if R_VERSION >= R_Version(4, 6, 0)
    R_mapAttrib(value, read_stored_list_attribute, &attributes);
#else
    for (SEXP attribute = ATTRIB(value); attribute != R_NilValue; attribute = CDR(attribute)) {
        if (TAG(attribute) == R_NamesSymbol) {
            attributes.names = CAR(attribute);
        }
        else if (TAG(attribute) == R_ClassSymbol) {
            attributes.classes = CAR(attribute);
        }
    }
#endif
    SEXP classes = attributes.classes;
    const char *kind = "list";
    if (classes != R_NilValue) {
        if (TYPEOF(classes) != STRSXP || ALTREP(classes) || XLENGTH(classes) != 1 ||
            STRING_ELT(classes, 0) == NA_STRING ||
            strcmp(Rf_translateCharUTF8(STRING_ELT(classes, 0)), "data.frame") != 0) {
            UNPROTECT(2);
            return result;
        }
        kind = "data.frame";
    }
    else if (Rf_isObject(value)) {
        UNPROTECT(2);
        return result;
    }
    SEXP names = attributes.names;
    if (names != R_NilValue &&
        (TYPEOF(names) != STRSXP || ALTREP(names) || XLENGTH(names) != count)) {
        UNPROTECT(2);
        return result;
    }
    const char *requested = NULL;
    if (name != R_NilValue) {
        if (TYPEOF(name) != STRSXP || ALTREP(name) || XLENGTH(name) != 1 ||
            STRING_ELT(name, 0) == NA_STRING) {
            UNPROTECT(2);
            Rf_error("Stored member inspection requires an ordinary name or NULL.");
        }
        requested = Rf_translateCharUTF8(STRING_ELT(name, 0));
    }
    SET_VECTOR_ELT(result, 0, Rf_ScalarLogical(TRUE));
    SET_VECTOR_ELT(result, 2, Rf_mkString(kind));
    if (names != R_NilValue) {
        SEXP copied_names = PROTECT(Rf_allocVector(STRSXP, count));
        int found = 0;
        for (R_xlen_t index = 0; index < count; index++) {
            SEXP label = STRING_ELT(names, index);
            SET_STRING_ELT(copied_names, index, label);
            if (!found && requested != NULL && label != NA_STRING &&
                strcmp(requested, Rf_translateCharUTF8(label)) == 0) {
                SEXP member = VECTOR_ELT(value, index);
                if (TYPEOF(member) != PROMSXP) {
                    SET_VECTOR_ELT(result, 3, member);
                }
                found = 1;
            }
        }
        SET_VECTOR_ELT(result, 1, copied_names);
        UNPROTECT(1);
    }
    UNPROTECT(2);
    return result;
}

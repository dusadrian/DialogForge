#define R_NO_REMAP
#include <R.h>
#include <Rinternals.h>
#include <R_ext/Connections.h>
#include <R_ext/Rdynload.h>
#include <R_ext/Visibility.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

#if R_CONNECTIONS_VERSION != 1
#error Unsupported R connection ABI for DialogForge output prototype
#endif

#define DF_FRAME_LIMIT 65536U
#define DF_JOURNAL_LIMIT (64U * 1024U * 1024U)

typedef struct {
    FILE *file;
    char *path;
    uint64_t sequence;
    size_t bytes;
    int failed;
    int sealed;
} df_output_journal;

typedef struct {
    SEXP owner;
    unsigned char channel;
} df_output_connection;

/* Host publication only: framing, sequence and seal belong to the writer below. */
static int df_output_publish(df_output_journal *journal,
                             const unsigned char *header, size_t header_length,
                             const unsigned char *bytes, size_t length)
{
#ifdef __EMSCRIPTEN__
    return EM_ASM_INT({
        try {
            const channel = globalThis.Module && globalThis.Module.webr
                && globalThis.Module.webr.channel;
            if (!channel || typeof channel.write !== "function") {
                return 0;
            }
            const memory = globalThis.Module.HEAPU8;
            const payload = new Uint8Array($2 + $4);
            payload.set(memory.subarray($1, $1 + $2));
            if ($4) {
                payload.set(memory.subarray($3, $3 + $4), $2);
            }
            channel.write({
                type: "dialogforge-output-journal",
                data: {
                    path: globalThis.Module.UTF8ToString($0),
                    offset: $5,
                    bytes: payload
                }
            }, [payload.buffer]);
            return 1;
        } catch (error) {
            return 0;
        }
    }, journal->path, header, header_length, bytes, length, journal->bytes);
#else
    /* Native readers observe the flushed file; no second publication stream. */
    return 1;
#endif
}

static df_output_journal *df_output_owner(SEXP owner)
{
    if (TYPEOF(owner) != EXTPTRSXP ||
        R_ExternalPtrTag(owner) != Rf_install("dialogforgeoutput.journal")) {
        Rf_error("Invalid DialogForge output journal.");
    }
    df_output_journal *journal = R_ExternalPtrAddr(owner);
    if (!journal) {
        Rf_error("DialogForge output journal is retired.");
    }
    return journal;
}

static void df_output_finalize(SEXP owner)
{
    df_output_journal *journal = R_ExternalPtrAddr(owner);
    if (journal) {
        if (journal->file) {
            fclose(journal->file);
        }
        free(journal->path);
        free(journal);
        R_ClearExternalPtr(owner);
    }
}

static void df_output_frame(df_output_journal *journal, unsigned char channel,
                            const unsigned char *bytes, size_t length)
{
    if (!journal->file || journal->sealed || journal->failed) {
        Rf_error("DialogForge output journal is not writable.");
    }
    if (length > DF_FRAME_LIMIT || journal->bytes + 13 + length > DF_JOURNAL_LIMIT ||
        journal->sequence >= UINT64_C(9007199254740991)) {
        journal->failed = 1;
        Rf_error("DialogForge output journal limit exceeded.");
    }

    unsigned char header[13];
    header[0] = channel;
    uint64_t sequence = ++journal->sequence;
    for (int index = 0; index < 8; index++) {
        header[1 + index] = (unsigned char)(sequence >> (56 - index * 8));
    }
    for (int index = 0; index < 4; index++) {
        header[9 + index] = (unsigned char)((uint32_t)length >> (24 - index * 8));
    }

    if (fwrite(header, 1, sizeof(header), journal->file) != sizeof(header) ||
        (length && fwrite(bytes, 1, length, journal->file) != length) ||
        fflush(journal->file) != 0) {
        journal->failed = 1;
        Rf_error("DialogForge output journal write failed.");
    }
    if (!df_output_publish(journal, header, sizeof(header), bytes, length)) {
        journal->failed = 1;
        Rf_error("DialogForge output journal publication failed.");
    }
    journal->bytes += sizeof(header) + length;
}

static size_t df_output_write(const void *bytes, size_t size, size_t count,
                              Rconnection connection)
{
    df_output_connection *output = connection->private;
    df_output_journal *journal = df_output_owner(output->owner);
    if (size && count > SIZE_MAX / size) {
        journal->failed = 1;
        Rf_error("DialogForge output write size overflow.");
    }
    size_t remaining = size * count;
    const unsigned char *next = bytes;
    while (remaining) {
        size_t length = remaining > DF_FRAME_LIMIT ? DF_FRAME_LIMIT : remaining;
        df_output_frame(journal, output->channel, next, length);
        next += length;
        remaining -= length;
    }
    return count;
}

static int df_output_flush(Rconnection connection)
{
    df_output_connection *output = connection->private;
    df_output_journal *journal = df_output_owner(output->owner);
    if (!journal->file || journal->failed || journal->sealed) {
        return EOF;
    }
    if (fflush(journal->file) != 0) {
        journal->failed = 1;
        return EOF;
    }
    return 0;
}

static void df_output_destroy(Rconnection connection)
{
    df_output_connection *output = connection->private;
    if (output) {
        R_ReleaseObject(output->owner);
        free(output);
        connection->private = NULL;
    }
}

static SEXP df_output_make_connection(SEXP owner, unsigned char channel)
{
    Rconnection connection;
    SEXP result = PROTECT(R_new_custom_connection(
        channel == 1 ? "DialogForge stdout prototype" : "DialogForge stderr prototype",
        "w", "dialogforge_output", &connection
    ));
    df_output_connection *output = calloc(1, sizeof(*output));
    if (!output) {
        Rf_error("Cannot allocate DialogForge output connection.");
    }
    /* R owns connection destruction; preserve the shared owner until then. */
    connection->private = output;
    connection->destroy = df_output_destroy;
    output->owner = owner;
    output->channel = channel;
    R_PreserveObject(owner);
    connection->isopen = TRUE;
    connection->canread = FALSE;
    connection->canwrite = TRUE;
    connection->write = df_output_write;
    connection->fflush = df_output_flush;
    /* Keep R's supplied formatted-write callback and native byte encoding. */
    UNPROTECT(1);
    return result;
}

static SEXP df_output_open(SEXP path)
{
    if (TYPEOF(path) != STRSXP || ALTREP(path) || XLENGTH(path) != 1 ||
        STRING_ELT(path, 0) == NA_STRING || !LENGTH(STRING_ELT(path, 0))) {
        Rf_error("Output capture requires one ordinary private file path.");
    }
    SEXP owner = PROTECT(R_MakeExternalPtr(
        NULL, Rf_install("dialogforgeoutput.journal"), R_NilValue
    ));
    R_RegisterCFinalizerEx(owner, df_output_finalize, TRUE);
    df_output_journal *journal = calloc(1, sizeof(*journal));
    if (!journal) {
        Rf_error("Cannot allocate DialogForge output journal.");
    }
    R_SetExternalPtrAddr(owner, journal);
    const char *file_path = Rf_translateChar(STRING_ELT(path, 0));
    journal->path = malloc(strlen(file_path) + 1);
    if (!journal->path) {
        Rf_error("Cannot retain DialogForge output journal path.");
    }
    memcpy(journal->path, file_path, strlen(file_path) + 1);
    /* Exclusive creation: never overwrite/reuse another activity's file. */
    journal->file = fopen(journal->path, "wbx");
    if (!journal->file) {
        Rf_error("Cannot exclusively create DialogForge output journal.");
    }
#ifdef __EMSCRIPTEN__
    /* The worker adapter pushes copied bytes, not a file path for polling.
       Keep its open spool anonymous; fclose/finalization releases the node.
       The shared writer, frames and seal are otherwise unchanged. */
    if (remove(journal->path) != 0) {
        journal->failed = 1;
        Rf_error("Cannot detach DialogForge worker output spool.");
    }
#endif
    if (fwrite("DFOUT001", 1, 8, journal->file) != 8 || fflush(journal->file) != 0) {
        journal->failed = 1;
        Rf_error("Cannot initialize DialogForge output journal.");
    }
    if (!df_output_publish(journal, (const unsigned char *)"DFOUT001", 8, NULL, 0)) {
        journal->failed = 1;
        Rf_error("Cannot publish DialogForge output journal header.");
    }
    journal->bytes = 8;
    SEXP result = PROTECT(Rf_allocVector(VECSXP, 3));
    SET_VECTOR_ELT(result, 0, owner);
    SET_VECTOR_ELT(result, 1, df_output_make_connection(owner, 1));
    SET_VECTOR_ELT(result, 2, df_output_make_connection(owner, 2));
    SEXP names = PROTECT(Rf_allocVector(STRSXP, 3));
    SET_STRING_ELT(names, 0, Rf_mkChar("handle"));
    SET_STRING_ELT(names, 1, Rf_mkChar("stdout"));
    SET_STRING_ELT(names, 2, Rf_mkChar("stderr"));
    Rf_setAttrib(result, R_NamesSymbol, names);
    UNPROTECT(3);
    return result;
}

static SEXP df_output_seal(SEXP owner)
{
    df_output_journal *journal = df_output_owner(owner);
    if (!journal->sealed) {
        df_output_frame(journal, 0, NULL, 0);
        journal->sealed = 1;
        int status = fclose(journal->file);
        journal->file = NULL;
        if (status != 0) {
            journal->failed = 1;
            Rf_error("Cannot close DialogForge output journal.");
        }
    }
    if (journal->failed) {
        Rf_error("DialogForge output journal failed.");
    }
    return Rf_ScalarReal((double)journal->sequence);
}

static SEXP df_output_abort(SEXP owner)
{
    df_output_journal *journal = df_output_owner(owner);
    journal->failed = 1;
    if (journal->file) {
        fclose(journal->file);
        journal->file = NULL;
    }
    return R_NilValue;
}

static const R_CallMethodDef call_methods[] = {
    {"df_output_open", (DL_FUNC) &df_output_open, 1},
    {"df_output_seal", (DL_FUNC) &df_output_seal, 1},
    {"df_output_abort", (DL_FUNC) &df_output_abort, 1},
    {NULL, NULL, 0}
};

void attribute_visible R_init_dialogforgeoutput(DllInfo *dll)
{
    R_registerRoutines(dll, NULL, call_methods, NULL, NULL);
    R_useDynamicSymbols(dll, FALSE);
    R_forceSymbols(dll, TRUE);
}

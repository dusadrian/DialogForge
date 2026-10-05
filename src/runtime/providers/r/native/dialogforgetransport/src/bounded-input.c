#ifndef _WIN32
#define _POSIX_C_SOURCE 200809L
#endif
#define R_NO_REMAP
#define R_INTERFACE_PTRS
#include <R.h>
#include <Rinternals.h>
#include <Rinterface.h>
#include <R_ext/Connections.h>
#include <R_ext/Rdynload.h>
#include <R_ext/Visibility.h>
#include <R_ext/Utils.h>
#include <string.h>

/* R exports the frontend entry point, but older Unix headers declare only
   ptr_R_ReadConsole. Keep its signature explicit for strict C compilers. */
extern int R_ReadConsole(const char *, unsigned char *, int, int);

#if defined(__EMSCRIPTEN__)
#include <emscripten/emscripten.h>
#elif defined(_WIN32)
#include <windows.h>
#else
#include <time.h>
#endif

#if R_CONNECTIONS_VERSION != 1
#error Unsupported R connection ABI for DialogForge transport prototype
#endif

static double df_frame_clock(void)
{
#if defined(__EMSCRIPTEN__)
    return emscripten_get_now() / 1000.0;
#elif defined(_WIN32)
    return (double)GetTickCount64() / 1000.0;
#else
    struct timespec now;
    if (clock_gettime(CLOCK_MONOTONIC, &now)) {
        Rf_error("DialogForge transport clock is unavailable.");
    }
    return (double)now.tv_sec + (double)now.tv_nsec / 1000000000.0;
#endif
}

static SEXP df_input_result(const char *status, const unsigned char *buffer, size_t used)
{
    SEXP result = PROTECT(Rf_allocVector(VECSXP, 2));
    SEXP names = PROTECT(Rf_allocVector(STRSXP, 2));
    SEXP bytes = PROTECT(Rf_allocVector(RAWSXP, (R_xlen_t)used));
    if (used) {
        memcpy(RAW(bytes), buffer, used);
    }
    SET_STRING_ELT(names, 0, Rf_mkChar("status"));
    SET_STRING_ELT(names, 1, Rf_mkChar("bytes"));
    SET_VECTOR_ELT(result, 0, Rf_mkString(status));
    SET_VECTOR_ELT(result, 1, bytes);
    Rf_setAttrib(result, R_NamesSymbol, names);
    UNPROTECT(3);
    return result;
}

static SEXP df_read_bounded_request(SEXP connection, SEXP maximum)
{
    if (TYPEOF(maximum) != INTSXP || XLENGTH(maximum) != 1 ||
        INTEGER(maximum)[0] < 512 || INTEGER(maximum)[0] > 16777216) {
        Rf_error("Invalid DialogForge bounded input limit.");
    }
    Rconnection input = R_GetConnection(connection);
    if (!input->isopen || !input->canread || input->text || !input->blocking) {
        Rf_error("DialogForge bounded input requires an open blocking binary reader.");
    }
    const size_t limit = (size_t)INTEGER(maximum)[0];
    unsigned char *buffer = (unsigned char *)R_alloc(limit + 1, sizeof(unsigned char));
    size_t used = 0;
    const double deadline = df_frame_clock() + 3.0;
    for (;;) {
        if (df_frame_clock() >= deadline) {
            return df_input_result("deadline", NULL, 0);
        }
        if ((used & 4095U) == 0) {
            R_CheckUserInterrupt();
        }
        unsigned char byte;
        // R's socket connection retains its own bounded read-ahead buffer.
        // Request one byte so this routine never consumes the next frame.
        if (R_ReadConnection(input, &byte, 1) != 1) {
            return df_input_result(used ? "truncated" : "closed_or_failed", NULL, 0);
        }
        if (df_frame_clock() >= deadline) {
            return df_input_result("deadline", NULL, 0);
        }
        if (byte == '\n') {
            if (used && buffer[used - 1] == '\r') {
                used--;
            }
            return df_input_result("line", buffer, used);
        }
        if (byte == 0) {
            return df_input_result("invalid_nul", NULL, 0);
        }
        if (used >= limit) {
            // Permit only the optional CR immediately before the final LF.
            if (used == limit && byte == '\r') {
                buffer[used++] = byte;
                continue;
            }
            return df_input_result("too_large", NULL, 0);
        }
        buffer[used++] = byte;
    }
}

static SEXP df_write_runtime_frame(SEXP connection, SEXP bytes)
{
    if (TYPEOF(bytes) != RAWSXP || XLENGTH(bytes) < 1 || XLENGTH(bytes) > 16777217) {
        Rf_error("Invalid DialogForge outbound frame.");
    }
    Rconnection output = R_GetConnection(connection);
    if (!output->isopen || !output->canwrite || output->text || !output->blocking) {
        Rf_error("DialogForge checked output requires an open blocking binary writer.");
    }
    size_t length = (size_t)XLENGTH(bytes);
    size_t written = 0;
    const double deadline = df_frame_clock() + 3.0;
    while (written < length) {
        R_CheckUserInterrupt();
        if (df_frame_clock() >= deadline) {
            return Rf_ScalarLogical(FALSE);
        }
        const size_t remaining = length - written;
        const size_t count = remaining > 65536 ? 65536 : remaining;
        const size_t accepted = R_WriteConnection(output, RAW(bytes) + written, count);
        // A short write may have delivered a prefix. Never resend it here.
        if (accepted != count) {
            return Rf_ScalarLogical(FALSE);
        }
        written += accepted;
    }
    return Rf_ScalarLogical(TRUE);
}

typedef int (*df_console_reader)(const char *, unsigned char *, int, int);
typedef struct {
    SEXP evaluate;
    SEXP read_reply;
    df_console_reader previous;
    Rboolean reading;
} df_console_scope;

static df_console_scope *active_console_scope = NULL;

typedef struct {
    df_console_scope *scope;
    const char *prompt;
} df_console_reply;

static SEXP df_get_console_reply(void *data)
{
    df_console_reply *request = data;
    request->scope->reading = TRUE;
    SEXP prompt = PROTECT(Rf_mkString(request->prompt));
    SEXP call = PROTECT(Rf_lang2(request->scope->read_reply, prompt));
    SEXP result = Rf_eval(call, R_GlobalEnv);
    UNPROTECT(2);
    return result;
}

static void df_finish_console_reply(void *data, Rboolean jump)
{
    df_console_reply *request = data;
    request->scope->reading = FALSE;
}

static int df_read_scoped_console(const char *prompt, unsigned char *buffer, int capacity, int history)
{
    df_console_scope *scope = active_console_scope;
    if (!scope || scope->reading || capacity < 2) {
        Rf_error("DialogForge console input has no available request owner.");
    }
    df_console_reply request = { scope, prompt };
    SEXP reply = PROTECT(R_UnwindProtect(
        df_get_console_reply, &request, df_finish_console_reply, &request, NULL
    ));
    if (TYPEOF(reply) != STRSXP || XLENGTH(reply) != 1 || STRING_ELT(reply, 0) == NA_STRING) {
        Rf_error("DialogForge console input did not return one reply.");
    }
    const char *text = Rf_translateCharUTF8(STRING_ELT(reply, 0));
    size_t length = strlen(text);
    if (length > (size_t)capacity - 2) {
        Rf_error("DialogForge console reply exceeds this R reader's byte limit.");
    }
    memcpy(buffer, text, length);
    buffer[length] = '\n';
    buffer[length + 1] = 0;
    UNPROTECT(1);
    return 1;
}

static SEXP df_evaluate_with_console_owner(void *data)
{
    df_console_scope *scope = data;
    active_console_scope = scope;
    ptr_R_ReadConsole = df_read_scoped_console;
    SEXP call = PROTECT(Rf_lang1(scope->evaluate));
    SEXP result = Rf_eval(call, R_GlobalEnv);
    UNPROTECT(1);
    return result;
}

static void df_release_console_owner(void *data, Rboolean jump)
{
    df_console_scope *scope = data;
    ptr_R_ReadConsole = scope->previous;
    active_console_scope = NULL;
}

static SEXP df_with_runtime_console_input(SEXP evaluate, SEXP read_reply)
{
    if (TYPEOF(evaluate) != CLOSXP || TYPEOF(read_reply) != CLOSXP || active_console_scope) {
        Rf_error("DialogForge console input requires one exclusive evaluation owner.");
    }
    df_console_scope scope = { evaluate, read_reply, ptr_R_ReadConsole, FALSE };
    return R_UnwindProtect(
        df_evaluate_with_console_owner, &scope, df_release_console_owner, &scope, NULL
    );
}

/* Host console mechanics only. Calling through R's console interface keeps
   physical interrupts on the R stack, outside an eval_js error translator. */
typedef struct {
    const char *prompt;
    unsigned char *buffer;
    int capacity;
    Rboolean interactive;
    df_console_reader console_reader;
    Rboolean host_transport;
} df_console_read;

static SEXP df_read_host_console(void *data)
{
    df_console_read *request = data;
    /* Evaluators temporarily disable R interactivity. The physical host console
       still exists; select its interactive branch only for this bounded read. */
    R_Interactive = TRUE;
    if (active_console_scope && (active_console_scope->reading || request->host_transport)) {
        ptr_R_ReadConsole = active_console_scope->previous;
    }
    return Rf_ScalarInteger(R_ReadConsole(request->prompt, request->buffer, request->capacity, 0));
}

static void df_restore_console_interactivity(void *data, Rboolean jump)
{
    df_console_read *request = data;
    R_Interactive = request->interactive;
    ptr_R_ReadConsole = request->console_reader;
}

static SEXP df_read_runtime_console_line(SEXP prompt, SEXP maximum, SEXP host_transport)
{
    if (TYPEOF(prompt) != STRSXP || ALTREP(prompt) || XLENGTH(prompt) != 1 ||
        STRING_ELT(prompt, 0) == NA_STRING || TYPEOF(maximum) != INTSXP ||
        XLENGTH(maximum) != 1 || INTEGER(maximum)[0] < 512 ||
        INTEGER(maximum)[0] > 16777216 || TYPEOF(host_transport) != LGLSXP ||
        XLENGTH(host_transport) != 1 || LOGICAL(host_transport)[0] == NA_LOGICAL) {
        Rf_error("Invalid DialogForge host console request.");
    }
    const size_t limit = (size_t)INTEGER(maximum)[0];
    const size_t capacity = limit + 2;
    unsigned char *buffer = (unsigned char *)R_alloc(capacity, sizeof(unsigned char));
    memset(buffer, 0, capacity);
    df_console_read request = {
        Rf_translateCharUTF8(STRING_ELT(prompt, 0)), buffer, (int)capacity,
        R_Interactive, ptr_R_ReadConsole, LOGICAL(host_transport)[0]
    };
    SEXP read_result = R_UnwindProtect(
        df_read_host_console, &request, df_restore_console_interactivity, &request, NULL
    );
    if (!INTEGER(read_result)[0]) {
        Rf_error("DialogForge host console closed without a reply.");
    }
    size_t used = 0;
    while (used < capacity && buffer[used]) {
        used++;
    }
    if (!used || used == capacity || buffer[used - 1] != '\n') {
        Rf_error("DialogForge host console returned an incomplete reply.");
    }
    used--;
    if (used && buffer[used - 1] == '\r') {
        used--;
    }
    if (used > limit) {
        Rf_error("DialogForge host console reply exceeded its limit.");
    }
    return Rf_ScalarString(Rf_mkCharLenCE((const char *)buffer, (int)used, CE_UTF8));
}

static const R_CallMethodDef call_methods[] = {
    {"df_read_bounded_request", (DL_FUNC) &df_read_bounded_request, 2},
    {"df_write_runtime_frame", (DL_FUNC) &df_write_runtime_frame, 2},
    {"df_read_runtime_console_line", (DL_FUNC) &df_read_runtime_console_line, 3},
    {"df_with_runtime_console_input", (DL_FUNC) &df_with_runtime_console_input, 2},
    {NULL, NULL, 0}
};

void attribute_visible R_init_dialogforgetransport(DllInfo *dll)
{
    R_registerRoutines(dll, NULL, call_methods, NULL, NULL);
    R_useDynamicSymbols(dll, FALSE);
    R_forceSymbols(dll, TRUE);
}

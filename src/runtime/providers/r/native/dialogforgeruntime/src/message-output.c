#define R_NO_REMAP
#include <R.h>
#include <Rinternals.h>
#include <R_ext/Connections.h>
#include <stdint.h>
#include <stdarg.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#if R_CONNECTIONS_VERSION != 1
#error Unsupported R connection ABI for DialogForge message output
#endif

typedef struct {
    SEXP targets;
    int selecting;
} df_message_output;

typedef struct {
    df_message_output *output;
    SEXP call;
} df_message_selection;

static SEXP df_message_output_select(void *data)
{
    df_message_selection *selection = data;
    return Rf_eval(selection->call, R_BaseEnv);
}

static void df_message_output_selection_done(void *data, Rboolean jumped)
{
    df_message_selection *selection = data;
    selection->output->selecting = 0;
}

static int df_message_output_printf(Rconnection connection, const char *format, ...)
{
    va_list arguments;
    va_start(arguments, format);
    int written = connection->vfprintf(connection, format, arguments);
    va_end(arguments);
    return written;
}

static size_t df_message_output_forward(Rconnection destination,
                                         const void *bytes, size_t length)
{
    if (!destination->text) {
        return R_WriteConnection(destination, (void *)bytes, length);
    }
    if (!destination->vfprintf) {
        Rf_error("Message output destination does not support text writes.");
    }
    if (length && memchr(bytes, '\0', length)) {
        Rf_error("Message output cannot forward embedded NUL bytes to a text connection.");
    }
    const unsigned char *next = bytes;
    size_t remaining = length;
    while (remaining) {
        int part = remaining > INT_MAX ? INT_MAX : (int)remaining;
        int written = df_message_output_printf(destination, "%.*s", part, (const char *)next);
        if (written < 0) {
            Rf_error("DialogForge message output forwarding failed.");
        }
        next += part;
        remaining -= part;
    }
    return length;
}

static size_t df_message_output_write(const void *bytes, size_t size, size_t count,
                                       Rconnection connection)
{
    df_message_output *output = connection->private;
    if (size && count > SIZE_MAX / size) {
        Rf_error("DialogForge message output size overflow.");
    }
    if (output->selecting) {
        Rf_error("Message output selection cannot write to its own connection.");
    }

    SEXP call = PROTECT(Rf_lang1(VECTOR_ELT(output->targets, 2)));
    df_message_selection selection = { output, call };
    output->selecting = 1;
    SEXP selected = PROTECT(R_UnwindProtect(
        df_message_output_select, &selection,
        df_message_output_selection_done, &selection, NULL
    ));
    if (TYPEOF(selected) != LGLSXP || XLENGTH(selected) != 1 ||
        LOGICAL(selected)[0] == NA_LOGICAL) {
        UNPROTECT(2);
        Rf_error("Message output selector must return one non-missing logical value.");
    }

    SEXP target = VECTOR_ELT(output->targets, LOGICAL(selected)[0] ? 0 : 1);
    Rconnection destination = R_GetConnection(target);
    size_t length = size * count;
    size_t written = df_message_output_forward(destination, bytes, length);
    UNPROTECT(2);
    if (written != length) {
        Rf_error("DialogForge message output forwarding was incomplete.");
    }
    return count;
}

static int df_message_output_flush(Rconnection connection)
{
    df_message_output *output = connection->private;
    for (int index = 0; index < 2; index++) {
        Rconnection destination = R_GetConnection(VECTOR_ELT(output->targets, index));
        if (destination->fflush && destination->fflush(destination) != 0) {
            return EOF;
        }
    }
    return 0;
}

static void df_message_output_destroy(Rconnection connection)
{
    df_message_output *output = connection->private;
    if (output) {
        R_ReleaseObject(output->targets);
        free(output);
        connection->private = NULL;
    }
}

SEXP df_message_output_open(SEXP stdout_connection, SEXP stderr_connection, SEXP selector)
{
    if (!Rf_inherits(stdout_connection, "connection") ||
        !Rf_inherits(stderr_connection, "connection") ||
        !Rf_isFunction(selector)) {
        Rf_error("Message output requires two open connections and a selector function.");
    }
    Rconnection stdout_target = R_GetConnection(stdout_connection);
    Rconnection stderr_target = R_GetConnection(stderr_connection);
    if (Rf_asInteger(stdout_connection) <= 2 || Rf_asInteger(stderr_connection) <= 2) {
        Rf_error("Message output destinations must be explicit non-console connections.");
    }
    if (!stdout_target->isopen || !stdout_target->canwrite ||
        !stderr_target->isopen || !stderr_target->canwrite) {
        Rf_error("Message output destinations must be open writable connections.");
    }

    SEXP targets = PROTECT(Rf_allocVector(VECSXP, 3));
    SET_VECTOR_ELT(targets, 0, stdout_connection);
    SET_VECTOR_ELT(targets, 1, stderr_connection);
    SET_VECTOR_ELT(targets, 2, selector);
    Rconnection connection;
    SEXP result = PROTECT(R_new_custom_connection(
        "DialogForge message output", "w", "dialogforge_message_output", &connection
    ));
    df_message_output *output = calloc(1, sizeof(*output));
    if (!output) {
        UNPROTECT(2);
        Rf_error("Cannot allocate DialogForge message output connection.");
    }
    output->targets = targets;
    R_PreserveObject(targets);
    connection->private = output;
    connection->destroy = df_message_output_destroy;
    connection->isopen = TRUE;
    connection->canread = FALSE;
    connection->canwrite = TRUE;
    connection->write = df_message_output_write;
    connection->fflush = df_message_output_flush;
    UNPROTECT(2);
    return result;
}

/* Windows R startup and physical I/O only. The helper DLL owns the shared
   console scope, prompt callbacks, bounds and unwind recovery. */
#ifdef _WIN32
#define Win32
#define WIN32_LEAN_AND_MEAN 1
#define R_NO_REMAP
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <io.h>
#include <fcntl.h>
#include <R.h>
#include <Rinternals.h>
#include <Rembedded.h>
#include <R_ext/RStartup.h>
#include <R_ext/Parse.h>
#include <R_ext/Utils.h>
#include <Rversion.h>
#include "console-host.h"

static HANDLE interrupt_event;
static df_console_reader console_reader;

static void df_process_host_events(void)
{
    if (interrupt_event && WaitForSingleObject(interrupt_event, 0) == WAIT_OBJECT_0) {
        UserBreak = 1;
    }
}

static BOOL WINAPI df_console_control(DWORD event)
{
    if (event == CTRL_C_EVENT || event == CTRL_BREAK_EVENT) {
        SetEvent(interrupt_event);
        return TRUE;
    }
    return FALSE;
}

static int df_read_stdin(const char *prompt, unsigned char *buffer, int capacity, int history)
{
    HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
    DWORD kind = GetFileType(input);
    fputs(prompt, stdout);
    fflush(stdout);
    int used = 0;
    while (used < capacity - 1) {
        df_process_host_events();
        R_CheckUserInterrupt();
        if (kind == FILE_TYPE_PIPE) {
            DWORD available = 0;
            if (!PeekNamedPipe(input, NULL, 0, NULL, &available, NULL)) {
                if (GetLastError() == ERROR_BROKEN_PIPE) {
                    break;
                }
                Rf_error("DialogForge Windows console input failed.");
            }
            if (!available) {
                Sleep(10);
                continue;
            }
        }
        else if (kind == FILE_TYPE_CHAR && WaitForSingleObject(input, 10) == WAIT_TIMEOUT) {
            continue;
        }
        DWORD count = 0;
        unsigned char byte;
        if (!ReadFile(input, &byte, 1, &count, NULL) || !count) {
            break;
        }
        buffer[used++] = byte;
        if (byte == '\n') {
            break;
        }
    }
    buffer[used] = 0;
    return used > 0;
}

static df_console_reader df_get_reader(void)
{
    return console_reader;
}

static void df_set_reader(df_console_reader reader)
{
    console_reader = reader;
}

__declspec(dllexport) const df_console_host_bridge *dialogforge_console_bridge(void)
{
    static const df_console_host_bridge bridge = { 1, df_get_reader, df_set_reader };
    return &bridge;
}

static int df_dispatch_console(const char *prompt, unsigned char *buffer, int capacity, int history)
{
    return console_reader(prompt, buffer, capacity, history);
}

static void df_write_console(const char *bytes, int length, int channel)
{
    FILE *output = channel ? stderr : stdout;
    fwrite(bytes, 1, length, output);
    fflush(output);
}

static void df_show_message(const char *message)
{
    fprintf(stderr, "%s\n", message);
}

static int df_confirm(const char *message)
{
    unsigned char reply[16];
    if (!df_dispatch_console(message, reply, sizeof(reply), 0)) {
        return 0;
    }
    return reply[0] == 'y' || reply[0] == 'Y' ? 1
        : reply[0] == 'n' || reply[0] == 'N' ? -1 : 0;
}

static void df_busy(int busy)
{
}

static void df_interrupt_name(char *name, size_t capacity, unsigned long pid)
{
    snprintf(name, capacity, "Local\\DialogForgeRInterrupt-%lu", pid);
}

int main(int argc, char **argv)
{
    /* Write UTF-8 bytes without CRT newline translation, like the other hosts. */
    _setmode(_fileno(stdout), _O_BINARY);
    _setmode(_fileno(stderr), _O_BINARY);
    char event_name[80];
    if (argc == 2 && !strcmp(argv[1], "--version")) {
        printf("R version " R_MAJOR "." R_MINOR " (DialogForge Windows console host)\n");
        return 0;
    }
    if (argc == 3 && !strcmp(argv[1], "--interrupt-pid")) {
        char *end;
        unsigned long pid = strtoul(argv[2], &end, 10);
        if (!pid || *end) {
            return 2;
        }
        df_interrupt_name(event_name, sizeof(event_name), pid);
        HANDLE event = OpenEventA(EVENT_MODIFY_STATE, FALSE, event_name);
        if (!event) {
            return 1;
        }
        int status = SetEvent(event) ? 0 : 1;
        CloseHandle(event);
        return status;
    }
    if (strcmp(getDLLVersion(), R_MAJOR "." R_MINOR)) {
        fprintf(stderr, "DialogForge Windows host requires its exact build-time R version.\n");
        return 2;
    }
    structRstart parameters;
    Rstart startup = &parameters;
    R_setStartTime();
    if (R_DefParamsEx(startup, RSTART_VERSION)) {
        return 2;
    }
    char *r_home = get_R_HOME();
    char *r_user = getRUser();
    if (!r_home || !r_user) {
        fprintf(stderr, "DialogForge Windows host requires the selected R installation.\n");
        return 2;
    }
    startup->rhome = r_home;
    startup->home = r_user;
    startup->CharacterMode = LinkDLL;
    startup->EmitEmbeddedUTF8 = FALSE;
    startup->ReadConsole = df_dispatch_console;
    startup->WriteConsole = NULL;
    startup->WriteConsoleEx = df_write_console;
    startup->CallBack = df_process_host_events;
    startup->ShowMessage = df_show_message;
    startup->YesNoCancel = df_confirm;
    startup->Busy = df_busy;
    startup->R_Quiet = TRUE;
    startup->R_Interactive = FALSE;
    startup->SaveAction = SA_NOSAVE;
    console_reader = df_read_stdin;

    /* Let R own its standard startup switches and profile/environment flags.
       Only expression/file selection belongs to this frontend's CLI adapter. */
    int common_argc = argc;
    char **common_argv = malloc(sizeof(char *) * (argc + 1));
    memcpy(common_argv, argv, sizeof(char *) * (argc + 1));
    R_common_command_line(&common_argc, common_argv, startup);
    const char *expression = NULL;
    const char *file = NULL;
    for (int index = 1; index < common_argc; index++) {
        const char *argument = common_argv[index];
        if (!strcmp(argument, "--args")) {
            break;
        }
        if (!strcmp(argument, "-e") && index + 1 < common_argc && !expression && !file) {
            expression = common_argv[++index];
        }
        else if (!strncmp(argument, "--file=", 7) && !expression && !file) {
            file = argument + 7;
        }
        else if ((!strcmp(argument, "--file") || !strcmp(argument, "-f"))
            && index + 1 < common_argc && !expression && !file) {
            file = common_argv[++index];
        }
        else if (strcmp(argument, "--no-readline")) {
            fprintf(stderr, "Unsupported DialogForge Windows host option: %s\n", argument);
            return 2;
        }
    }
    if (!expression && !file) {
        fprintf(stderr, "Supply the shared R launcher expression or an R source file.\n");
        return 2;
    }
    df_interrupt_name(event_name, sizeof(event_name), GetCurrentProcessId());
    interrupt_event = CreateEventA(NULL, FALSE, FALSE, event_name);
    if (!interrupt_event) {
        return 2;
    }
    SetConsoleCtrlHandler(df_console_control, TRUE);
    SetConsoleCP(CP_UTF8);
    SetConsoleOutputCP(CP_UTF8);
    R_SetParams(startup);
    freeRUser(r_user);
    free_R_HOME(r_home);
    free(common_argv);
    R_set_command_line_arguments(argc, argv);
    GA_initapp(0, NULL);
    readconsolecfg();
    setup_Rmainloop();

    int error = 0;
    if (file) {
        SEXP name = PROTECT(Rf_mkString(file));
        SEXP call = PROTECT(Rf_lang2(Rf_install("source"), name));
        R_tryEval(call, R_GlobalEnv, &error);
        UNPROTECT(2);
    }
    else {
        ParseStatus status;
        SEXP text = PROTECT(Rf_mkString(expression));
        SEXP parsed = PROTECT(R_ParseVector(text, -1, &status, R_NilValue));
        error = status != PARSE_OK;
        for (R_xlen_t index = 0; !error && index < XLENGTH(parsed); index++) {
            R_tryEval(VECTOR_ELT(parsed, index), R_GlobalEnv, &error);
        }
        UNPROTECT(2);
    }
    Rf_endEmbeddedR(error);
    CloseHandle(interrupt_event);
    return error ? 1 : 0;
}
#endif

#ifndef DIALOGFORGE_CONSOLE_HOST_H
#define DIALOGFORGE_CONSOLE_HOST_H

typedef int (*df_console_reader)(const char *, unsigned char *, int, int);

/* The Windows frontend owns the callback slot from R startup onward. This
   bridge exposes that slot, not prompt policy or an alternative evaluator. */
typedef struct {
    unsigned int version;
    df_console_reader (*get_reader)(void);
    void (*set_reader)(df_console_reader);
} df_console_host_bridge;

#endif

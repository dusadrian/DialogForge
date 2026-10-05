# Windows console host

Windows R does not expose the Unix `ptr_R_ReadConsole` callback slot. Its
callback is installed when an embedding frontend starts R. The bundled
`dialogforge-r-host.exe` uses that supported startup boundary and owns a small
versioned callback-slot bridge. It checks the exact build-time R DLL version.

`bounded-input.c` uses that slot through thin get/set adapters on Windows; Unix
and WebR use their existing R slot. The same C functions own evaluation scopes,
prompt replies, bounded reads and unwind restoration on all hosts. No Windows
copy of those behaviors exists. The frontend executes the shared R launcher,
not a second control loop, workspace implementation or event protocol.

The physical Windows adapter polls pipe input without blocking R's interrupt
checks. A task-owned, process-specific event signals a normal R interrupt;
Windows process termination is not substituted for Interrupt. UTF-8 Windows
startup encoding is selected through the executable manifest. Scope recovery
is exercised by the same canonical R cases, with additional physical Windows
file/argument, missing-bridge and interrupt cases.

This is helper/frontend acceptance, not rendered desktop or signed installer
acceptance. Windows signing may transform the frontend executable; final
delivery checks must account for that transformation without changing the
original qualified payload pin.

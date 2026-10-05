# Historical transport-component design notes

The implementation is now part of the single `dialogforgeruntime` 0.1.0 package.
Older component versions and prototype acceptance notes below are historical;
the parent README owns current build instructions.

Version0.0.3 supplies a scoped frontend reader used by BOTH hosts for visible
evaluation. Raw R console calls, scan() and readLines(stdin()) enter the existing
SAME runtimePromptCore.R owner; C only bridges the frontend buffer. Native socket
versus worker console reads remain physical adapters. No C prompt identity,
ordering, lifecycle or reply policy is maintained separately.

The original frontend and callback state are restored with R_UnwindProtect on
normal return, callback/evaluation error and interruption. The worker's nested
physical read temporarily uses the captured frontend rather than recursively
creating another prompt. Input is rejected if it cannot fit the requesting R
reader's actual buffer; it is never silently truncated. Raw scopes are exclusive.
Both generated bundles stage the same helper source built for their host; native
staging includes/unpacks its library. Missing/stale helpers fail startup rather
than presenting unanswerable raw input. The bounded socket reader remains opt-in;
this change does not promote ordered output or bounded sockets by default.

Physical paired checks cover scoped direct console/scan/stdin reads, blank and
Unicode replies, oversized failure/recovery. Full foreign-extension buffer
behavior, other supported native builds and rendered input controls remain open.

Version 0.0.2 adds a bounded public R console read for the worker host adapter.
It selects the interactive host-console branch only during that call, restoring
the evaluator's original R_Interactive value through R_UnwindProtect on success,
error and physical interruption. This avoids an eval_js bridge converting the
real interrupt into a generic evaluation error. It does not classify error
messages, implement prompt identity/replies or install parallel evaluation policy.
Native process/socket and WebR channel adapters use SAME shared R prompt/evaluation
sources; only the physical host read differs.

Both builds consume one source archive via build-r-runtime.js
[native|webr|both]. The WebR worker stages the versioned helper archive with the
inspection helper before installing its console adapter. Missing/stale helpers
fail startup explicitly. This does not enable the native bounded-socket prototype
by default or prove rendered controls, all supported R builds or release readiness.

## Bounded socket prototype

This project-owned helper reads one newline-delimited request through R's
connection API, retaining at most the configured payload bound plus one optional
CR. It reads one byte at a time in native code; R's socket implementation performs
bounded read-ahead internally. No bytes belonging to a subsequent frame are
consumed by this reader. The returned raw payload adds one bounded copy.

Only `status == "line"` is eligible for decoding and dispatch. Oversize, NUL,
truncation, EOF/read failure, thrown errors and interruption require retiring the
connection. Never retry consumed partial bytes or execute an unterminated request.
The caller owns timeout policy, socket lifecycle, decoding and protocol validation.

Requires a blocking binary connection and the supported R connection ABI. It does
not change socket write behavior, implement asynchronous I/O, authenticate peers,
or prove deadline/Interrupt/platform compatibility. Explicit maintainer opt-in:
`DIALOGFORGE_BOUNDED_INPUT_PROTOTYPE=1` with `DIALOGFORGE_TRANSPORT_LIBRARY` pointing
to the isolated built library. Startup checks package version and confirms the
reader/limit through metadata; there is no silent fallback if the helper is absent.
Normal startup remains unchanged. Native socket-fragment acceptance and build verification
remain required before hookup/promotion. No WebR socket implementation is implied.

The opt-in also uses `write_checked_runtime_frame()` for complete response/live
event frames. It checks R's reported byte count and never retries a short write.
Errors, interruption or short writes retire the current connection; later live
events cannot silently fall back to a replay file after that failure. A successful
write is not consumer acknowledgement. Output frames are capped at 16 MiB plus LF;
encoding still allocates before this check. Blocking socket timeouts remain R-owned.

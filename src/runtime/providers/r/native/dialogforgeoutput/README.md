# Shared output capture prototype

Ordinary native and browser app compositions now request ordered capture and
stage the generated helper resources. Programmatic worker hosts can omit the
ordered-output options; native diagnostic runs can explicitly select grouped
capture with `DIALOGFORGE_ORDERED_OUTPUT_PROTOTYPE=0`. This source integration
does not establish release or all-producer acceptance.

Earlier native R 4.6.1/macOS arm64 and WebR
4.6.0 builds now pass 14 SAME physical-adapter cases: early/interleaved output,
Unicode boundaries, warning modes, messages, errors, visible/empty results, real
prompt replies, failed capture and following-command recovery. This is not
rendered console, full producer/Interrupt/restart or release acceptance.

Accepted native journals are closed and released by the shared reader after
matching sealed receipts. Its thin file adapter checks the captured dev/inode
identity before unlinking; failed/retired captures remain for session cleanup.
WebR's pushed-byte adapter needs no pollable filename: the SAME C writer opens
its spool exclusively, then makes that spool anonymous; closing/finalizing the
open spool releases its worker storage. Frames, ordering, receipts and completion
are the same shared source, not a WebR implementation.

The following original prototype design notes retain restrictions and historical
unverified boundaries. Dated acceptance evidence and remaining gates are tracked
in the private architecture/status records; do not read older unverified claims
as overriding the qualified acceptance above.

This package
is separate from `dialogforgeinspect` because inspection and output capture have
different contracts. Its two custom R connections share a single native writer;
there are no R publisher callbacks inside the writer and no patched cat/print.

The file starts with eight ASCII bytes `DFOUT001`. Each frame has one channel
byte (1 stdout, 2 stderr, 0 producer seal), eight big-endian sequence bytes and
four big-endian payload-length bytes, followed by the native payload bytes.
Sequence starts at one and includes the seal. A seal has an empty payload.
Writes larger than 64 KiB split into consecutive frames; total journal storage
is limited to 64 MiB. Limit/I/O errors fail the writer, with no replay or false
seal. A short write may leave an incomplete final frame; consumers must retain
incomplete data and distinguish failed/retired producers from sealed producers.
Finalizer cleanup never generates a successful seal.

Files must live in an activity-owned private directory; exclusive creation
prevents reuse/overwrite but is not an identity protocol. Session/activity binding,
incremental framing/byte decoding and consumption acknowledgments remain to be
implemented. The R journal prototype specifies publication semantics; this file
is its capture backend groundwork, not a second channel-aggregation step. The
integration must retain producer sequences rather than independently resequence.
The isolated runtimeOutputJournalReaderPrototype.ts now implements that separate
native reader: bounded async polls, partial-frame retention, stable-file checks,
copied session/activity ownership and fail-closed raw-byte publication. Final
acceptance requires a matching sealed evaluation receipt and exact final sequence,
not only the file seal. Its isolated runtimeOutputTranscriptBridgePrototype.ts
now supplies explicit UTF-8 decoding and standard transcript events. Host encoding
confirmation is still required; native bytes are not guessed. Same-channel partial
characters are retained; invalid/truncated text or partial characters crossing
channels fail instead of reordering or inserting replacement glyphs. Composed
completion acceptance requires the raw receipt AND successful text finish.
Native interactive source integration supplies dispatch-bound polling and the
existing transcript callback behind an explicit prototype flag. Default execution
still uses grouped capture; real live console delivery has not been demonstrated.
WebR compiles this same package source, not a second writer. It cannot inherit
the native file observation mechanism simply by compiling the package.

The same C writer now has an Emscripten-only host publication hook. After each
successful file flush, it copies the existing journal header/frame bytes to
WebR's worker channel as `dialogforge-output-journal`, carrying the private path
and byte offset. It does not regenerate frames, sequences, text events or seals.
Native publication remains file observation. A missing/throwing worker channel
fails capture rather than silently reverting to batched output. Successful
channel enqueue is NOT consumer acceptance; completion still requires the
shared reader's matching producer receipt and transcript finish.

This hook references the version-sensitive `Module.webr.channel` boundary
inspected in WebR 0.6.0's worker source. Emscripten linking, heap access,
transfer behavior, worker queue bounds/backpressure and actual concurrent
delivery remain unverified. Browser routing must match an activity-owned path
before forwarding bytes to the shared reader; the path is not authentication.
The existing interactive WebR read loop now has optional request-owned routing
to the shared byte reader/transcript pipeline. Native and WebR both use
runtimeOutputTranscriptReader.ts for composition and the completion barrier.
Both adapters also use rOrderedOutputDelivery.ts for response receipts and failed
delivery completion. WebR exposes optional setup through the shared R configuration
function, requiring an explicitly staged library and request-owned delivery factory
together. Normal browser startup supplies neither; no default capture is enabled.
The interactive host loop retains pending reads across evaluation-first races
and waits for a request-bound worker queue fence before handling final receipts.
The fence is transport metadata, not output completion. Missing fences/read
failures detach the client; real worker ordering/error/Interrupt acceptance is
still open. Detected graphics commands now reuse the existing canvas capture in
response-file mode, leaving queue drain to the caller and returning images through
the existing callback. Normal batch defaults are unchanged. Combined graphics/
output/prompt/Interrupt and indirect plot detection acceptance remain open.
Do not add a competing `WebR.read()` loop: existing prompt/graphics handling
also owns that queue and must share routing. Ordinary execution remains batched.

R's supplied formatted-write callback feeds this connection's raw writer.
Only writes routed through these connections share the journal's order. Rprintf
and REprintf, messages, immediate warnings, sink redirection, and encoding must
be exercised on each supported R build. Direct C stdio, subprocess writes and
independent process pipes are outside that guarantee. R's formatted-write
callback can allocate its own buffer; bounded frames do not bound that buffer.

The native package installs no warning handlers. The isolated R-side
runtimeOrderedCapturePrototype.R adapter installs capture sinks, evaluates and
prints visible results, applies the existing narrow package-warning filter, and
lets R own other warning/message behavior. It uses R's version-sensitive
`.Internal(printDeferredWarnings())` before restoring routing to flush warn=0.
That stock internal includes an "In addition:" prefix; normal app warning
presentation/channel classification and package diagnostic delivery are not
accepted or integrated yet. No replacement warning formatter is introduced.
Immediate overrides and warn-as-error remain R's decision. The command must
start with an empty deferred warning queue; there is no supported public queue
inspection API, and this prototype must not silently assign prior warnings to
the new activity. Nested ordered invocations are rejected for that reason.

Cleanup runs with interrupts suspended, restores the original message destination,
and unwinds command-added output sinks only above the saved caller depth. It
does not close caller connections. Sink routing failure prevents successful
capture status and triggers explicit native abort without a seal. Removing
pre-existing caller sinks, or removing/replacing the capture at the same depth,
cannot be reconstructed or reliably detected by this R-only adapter; these are
explicit restrictions, not accepted arbitrary-sink support. Persistent command-
added sinks are unwound by this experimental invocation boundary; this policy is
not enabled in normal execution. Evaluation outcomes and capture status remain
separate: a failed/interrupted evaluation may still have completely sealed output.
Disk failure/limits, non-ASCII encoding, compiled writes, real Interrupt handling
and native rendered acceptance remain open.

Custom connections depend on R's version-sensitive connection ABI, checked at
compile time against version 1. Exact native R/OS build acceptance is required;
this is not an assurance of future ABI compatibility. Consult the upstream
[connection header](https://github.com/wch/r-source/blob/trunk/src/include/R_ext/Connections.h)
and [implementation](https://github.com/wch/r-source/blob/trunk/src/main/connections.c)
when changing callbacks or ownership. These were inspected alongside the installed
R headers before implementing the prototype. Distribution integration remains
absent until this capture boundary is accepted.

Queued regression: `scripts/check-native-output-capture.R`, using the isolated
library supplied in `DIALOGFORGE_OUTPUT_LIBRARY`. It reads the file while sinks
are active (producer evidence only), checks interleaving, exact bytes, sequences,
seal, exclusive creation, warning modes, post-seal rejection and frame splitting.
Evaluation cases include deferred/immediate/forced/suppressed/error warnings,
no deferred spill into the next invocation, errors, synthetic Interrupt,
visible results/messages, caller sink restoration, balanced nested sinks,
removed capture routing and rejected seal/abort behavior.
Do not run it implicitly as part of normal startup or package loading.

Queued reader regression: `scripts/check-native-output-reader.js`. It exercises
growth, framing, publication/ownership failures and receipt matching using private
temporary files; it does not establish the C/R writer or rendered-app acceptance.

Queued transcript regression: `scripts/check-native-output-transcript.js` covers
Unicode boundaries, standard event identity/metadata, guarded callback acceptance
and the growing-file reader-to-transcript path. It does not establish native R
encoding negotiation, launcher integration, console rendering or paint/drain.

Explicit helper build entry: `node scripts/build-r-output-prototype.js [native|webr|both]`.
The default remains native. It uses DIALOGFORGE_BUILD_R (default R) to create one
retained source archive from this package directory. With `both`, native and
WebR compilation consume that exact archive. Native installs into
`dist/r-output-prototype/native/<platform-version>`, not the shared R library.
WebR uses the same `scripts/build-r-helper-webr.R` entry as the inspection helper,
with the pre-existing Docker toolchain route (default image
`ghcr.io/r-wasm/webr:v0.6.0`, overridable via DIALOGFORGE_WEBR_BUILD_IMAGE).
It writes under `dist/r-output-prototype/webr/<webr-version>`; no browser mounting,
startup loading or publication adapter is added. The build container has no
network access. The image must already be available for an offline build.
Neither target has been built for this output prototype; WebR connection ABI,
virtual-filesystem writes and live publication remain acceptance requirements.
No regression/load acceptance is implied. For an authorized experimental launch,
set DIALOGFORGE_ORDERED_OUTPUT_PROTOTYPE=1 and DIALOGFORGE_OUTPUT_LIBRARY to that
exact library. Only interactive native sessions are supported. Startup requires
helper 0.0.1, UTF-8 and matching identity; failures do not silently fall back.
This is not an ordinary-user startup/release dependency.

The opt-in evaluator also records errors through the existing app traceback
recorder before unwinding. Retained package warnings feed the same diagnostic
emitter used by grouped capture after the journal is sealed, as control-stream
tails returned following reader acceptance. The generator's existing inspection
behavior is unchanged. Source continuity does not establish rendered warning
parity or extend automatic-inspection acceptance to diagnostic generation.

Queued hook regression: `scripts/check-native-ordered-output-hook.js` exercises
executor-to-file-reader/transcript delivery with simulated control responses,
not real native R, prompt/Interrupt, visible or platform acceptance. Legacy process
pipes still lack explicit drain/attribution ownership.

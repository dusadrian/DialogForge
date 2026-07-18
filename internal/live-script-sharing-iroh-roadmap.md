# Live Script Sharing over iroh: Agent Roadmap

## Status And Purpose

Status: implementation in progress. Phase 0 completed on 2026-07-18.

This document is the execution plan for adding live Script Editor tab sharing
to DialogForge. It is written for an AI agent working in a dedicated task. The
agent must follow the phases in order, update the status ledger after every
slice, and stop at the explicit decision gates rather than silently choosing a
different architecture.

The intended classroom workflow is:

1. An instructor shares one Script Editor tab from an installed DialogForge
   product, or eventually from its browser build.
2. Participants join from installed applications or browsers.
3. Instructor edits appear in participants' shared tabs with low latency.
4. Participants can select code and use Ctrl/Cmd+Enter to execute it against
   their own runtime.
5. Receiving code never executes it automatically.

The first supported topology is one installed instructor and many read-only
participants. Multi-writer editing is explicitly deferred.

## Status Ledger

The agent must preserve this table and update it in place. A phase may be
marked `done` only when its acceptance gate is satisfied.

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Confirm baseline and freeze decisions | done |
| 1 | Define the host-neutral live-script contract | not started |
| 2 | Prove native iroh transport in DialogForge | not started |
| 3 | Implement shared single-writer synchronization | not started |
| 4 | Add and verify installed-app sharing UI | not started |
| 5 | Harden native sessions and packaging | not started |
| 6 | Create the separately versioned Rust/WebAssembly client | not started |
| 7 | Integrate browser participants | not started |
| 8 | Verify mixed-host classrooms and decide fan-out transport | not started |
| 9 | Release, document, and enable the capability | not started |

## Non-Negotiable Product Invariants

These rules apply to every phase:

- DialogForge owns the user-facing feature, Script Editor semantics, wire
  contract, permissions, and lifecycle.
- Product repositories may contribute policy defaults or translations, but
  DialogR and DialogQCA must not implement separate collaboration systems.
- The existing Script Editor remains the only editor implementation. Do not
  create a collaboration-specific editor or a browser-only approximation.
- The installed application and browser use the same session and message
  semantics.
- Execution remains local. No transport message may invoke a participant's
  runtime or synthesize Ctrl/Cmd+Enter.
- A participant cannot modify the shared document. The live tab is read-only
  and must reject typing, paste, deletion, undo, redo, and other content
  mutations while still allowing cursor movement, selection, copying, and
  local execution.
- Remote changes must not mark a participant's local files dirty.
- A shared document must not reveal the instructor's local filesystem path,
  workspace contents, runtime state, settings, environment, or credentials.
- Ending a session must revoke its session capability without replacing the
  application's long-lived iroh identity.
- The feature must be unavailable or visibly disabled when the host cannot
  provide collaboration. It must not affect ordinary Script Editor behavior.
- Browser adaptations belong in `src/shell-web`; Electron-specific behavior
  belongs in `src/shell-electron`; shared feature logic belongs under
  `src/script-editor`.
- The wire protocol must not depend on Cloudflare, Hetzner, or another hosting
  provider. Rendezvous and relay deployments are configurable infrastructure.
- Do not branch on product or runtime provider names. Live script sharing is a
  host capability and is independent of R, Python, or another provider.

## Confirmed Baseline

Before implementation, the agent must recheck these facts because dependency
versions and working-tree state can change.

### DialogForge

- Electron is currently declared as version 22 in `package.json`.
- Electron 22 embeds Node 16.17.1 and exposes N-API 8 on the current macOS
  checkout.
- The existing Script Editor stores each tab in a Monaco text model through
  `src/script-editor/state/scriptDocument.ts`.
- `ScriptDocument.muteChanges` already distinguishes programmatic content
  replacement from user edits.
- Ctrl/Cmd+Enter execution is owned by
  `src/script-editor/renderer/scriptExecutionController.ts` and already sends
  selected/current code through the host transport.
- The browser hosts the same Script Editor page through
  `src/shell-web/browserScriptEditorSurface.ts`.

### Verzan Reference

Reference repository:

`/Users/dusadrian/Documents/GitHub/Verzan`

Verzan demonstrates a working native pattern:

- `src/modules/p2p/p2p.ts` loads `@number0/iroh`, creates a persistent or
  in-memory endpoint, registers a custom ALPN, opens bidirectional streams, and
  encodes compact node-address connection codes.
- `src/modules/p2p/p2p_app.ts` persists the node secret, routes incoming
  messages, tracks peers, reconnects, and exposes Electron IPC.
- A small Cloudflare service supplies rendezvous/presence information. The
  application data still travels through encrypted iroh connections.
- Verzan uses Electron 39 and `@number0/iroh` 0.35.

Verzan is a transport reference, not code to copy wholesale. DialogForge must
not inherit Verzan's roles, database synchronization, user registry, admin
messages, Cloudflare secrets, or application-specific payloads.

### Native Compatibility Observation

The current `@number0/iroh` 0.35 package declares Node 20.3 or newer. A local
diagnostic nevertheless loaded that exact Verzan binding inside DialogForge's
Electron 22 runtime, created an `Iroh.memory()` endpoint, read its node ID and
addresses, and shut it down successfully on macOS arm64.

This observation permits a native proof of concept. It does not establish
official support or cross-platform packaging compatibility. Every target must
be verified, and failure must leave the rest of DialogForge functional.

### Browser iroh Boundary

The Node package used by Verzan is a native N-API module and cannot run in a
normal browser. Browser participation therefore needs a Rust iroh client
compiled to WebAssembly. Current iroh browser networking uses encrypted relay
connections over browser-compatible WebSockets; native peers may also establish
direct connections.

The Rust/WebAssembly client should be a separately versioned project because it
has its own Rust toolchain, dependency lockfile, build pipeline, cross-language
bindings, browser compatibility work, and release artifacts. DialogForge still
owns the wire contract and consumes the built artifact.

### Rendezvous And Relay Deployment Direction

Rendezvous and relay are different services and must remain separate in the
architecture:

- Rendezvous maps a short, human-friendly classroom code to an opaque,
  short-lived session ticket. It never receives script contents.
- An iroh relay routes end-to-end encrypted traffic when peers cannot connect
  directly. It is stateless with respect to the live document.

The recommended sequence is:

1. Begin with no rendezvous service. Display the complete session ticket as a
   QR code and copyable link. This no-service path is sufficient to prove the
   transport and remains useful when the instructor can distribute the link
   through an LMS, chat, email, or shared course page. It is not sufficient by
   itself for a computer-only participant who has no link-delivery channel.
2. Add short classroom codes after the full-ticket workflow is stable but
   before calling the feature classroom-ready.
   Use a Cloudflare Worker plus one SQLite-backed Durable Object per live
   session for global, strongly consistent creation, lookup, revocation, and
   expiry.
3. Run a dedicated `iroh-relay` on the available Hetzner server for controlled
   relay capacity, jurisdiction, and production independence.
4. Keep a tiny self-hosted rendezvous implementation available for deployments
   that prefer to run both services on Hetzner.
5. Add further relays later only when regional measurements justify them.

At the expected classroom volume, rendezvous CPU and storage are negligible.
Operational simplicity, immediate consistency, expiry behavior, and failure
isolation are more important than request throughput.

#### Spoken Short-Code Contract

The classroom code must be designed to be spoken aloud, not merely shortened
for typing. Version 1 should use three unrelated, familiar words, displayed as
`maple-river-lantern`. An instructor should be able to say the code once and a
participant should be able to type it without seeing the instructor's screen.

The exact vocabulary needs a deliberate review with the target classroom
languages before implementation. Its contract is:

- use a curated, versioned vocabulary large enough to provide at least 33 bits
  of randomness across three independently selected words;
- prefer short, common, easily pronounced words and exclude homophones,
  profanity, culturally inappropriate terms, ambiguous spellings, and words
  that are easily confused when heard;
- do not use sequential codes, recognizable phrases, runtime names, file
  names, instructor details, or any value derived from the session ticket;
- display words with hyphens, but accept spaces or hyphens, repeated
  whitespace, and any letter case when resolving a code;
- normalize input consistently in native and browser clients without silently
  substituting one word for another;
- let the instructor regenerate an awkward code before announcing it;
- create the mapping atomically and regenerate on collision;
- expire and revoke it with the underlying session, and never reuse a code
  while an old mapping could still be resolved;
- rate-limit failed lookups and bound retries so the spoken code does not
  become an enumerable public index of active sessions;
- never log the complete code or the ticket it resolves to.

The three words are a bearer credential. Their convenience does not replace
expiry, revocation, lookup throttling, or the unguessable capability inside the
resolved ticket. A checksum, if later added for transcription feedback, must be
additional to the required randomness rather than replacing any of it.

| Option | Efficiency | Use |
| --- | --- | --- |
| Full-ticket QR code with copyable link | Best: no service, no storage, no provider | Mandatory technical baseline; practical when a camera or link-delivery channel exists |
| Cloudflare Worker plus Durable Object | Best managed/global option; strongly consistent and can expire itself with an alarm | Recommended default for computer-only short-code joining |
| Tiny Hetzner rendezvous service | Lowest incremental hosting cost when the server already exists; requires deployment, monitoring, TLS, rate limiting, and failover decisions | Supported self-hosted alternative |
| Cloudflare Workers KV | Excellent read scaling but eventually consistent | Do not use for immediate code creation or revocation |
| Cloudflare R2 or D1 | Technically possible but adds storage/query and cleanup semantics not needed by a tiny per-session mapping | Do not use unless requirements expand |

The Cloudflare rendezvous should use ordinary HTTP requests only. It does not
need WebSockets because all live content and presence continue over iroh. On
the current Cloudflare free plan, SQLite-backed Durable Objects include daily
request, row-read, row-write, and storage allowances far above the expected
classroom-code workload. Each session object must schedule expiry and remove
its stored ticket so abandoned objects do not accumulate.

Do not use Cloudflare Workers KV for an immediately usable classroom code.
Workers KV is eventually consistent, and a newly created or revoked code may
remain invisible or stale in another region for approximately a minute or
longer. Durable Objects provide the per-session strong consistency this
workflow needs.

This is a deployment recommendation, not a permanent provider commitment. The
rendezvous API must support the small self-hosted implementation on Hetzner,
and relay URLs must be configuration. The Hetzner rendezvous should be a
separate small process or container beside `iroh-relay`, not a fork that mixes
rendezvous state into the stateless relay. A dedicated deployment may run both
services on Hetzner, while a low-operations deployment may use Cloudflare
rendezvous and managed, public, or self-hosted iroh relays.

## Ownership Boundaries

| Owner | Responsibilities |
| --- | --- |
| `src/script-editor/collaboration` | Protocol types, session state machine, revisions, edit validation, permissions, resynchronization, participant state, host-neutral controller |
| `src/script-editor/renderer` | Monaco observation/application, shared-tab lifecycle, read-only behavior, cursor/selection preservation, local execution integration |
| `src/shell-electron/collaboration` | Native iroh lifecycle, secure identity storage, Electron IPC, native connection/ticket adapter, application shutdown |
| `src/shell-web` | Lazy WebAssembly loading, browser transport adapter, browser session links, browser lifecycle and error presentation |
| Separate Rust/WebAssembly project | Pinned Rust iroh implementation, WebAssembly bindings, relay-compatible endpoint, transport events, distributable browser artifact |
| Product contribution | Optional default enablement, product wording, translations, or deployment-specific rendezvous/relay configuration |

Introduce provider-neutral host interfaces for rendezvous publication,
resolution, and revocation. Do not expose Cloudflare Durable Object bindings or
Hetzner service details to the shared Script Editor controller.

The Rust/WebAssembly project must not know about Monaco, Script Editor tabs,
runtime execution, DialogR, DialogQCA, or product settings. It transports
bounded protocol frames and reports connection events.

## Target User Experience

### Instructor

1. Open or activate a Script Editor tab.
2. Choose `Share live` from the existing Script Editor toolbar or tab menu.
3. Receive a QR code, copyable link, and short session code. The QR and link are
   available immediately; the code depends on configured rendezvous.
4. See participant count and connection health without leaving the editor.
5. Continue editing normally. The local tab retains ordinary dirty/save
   behavior.
6. Optionally broadcast the instructor cursor or selection as presence.
7. Choose `Stop sharing` to revoke the session and notify participants.

### Participant

1. Join through whichever classroom channel is available: scan the QR code
   using a camera-equipped device, open a link delivered through the LMS/chat,
   paste a complete ticket, or type the three-word session code spoken by the
   instructor directly on the participant computer.
2. Receive a Script Editor tab labeled as live and read-only. The participant
   cannot change its contents.
3. See changes without losing the local selection or unexpectedly moving the
   viewport.
4. Optionally enable `Follow instructor cursor`.
5. Select code or position the cursor and use Ctrl/Cmd+Enter. The code executes
   only in the participant's own runtime.
6. Choose `Make editable copy` to detach the current snapshot into an ordinary
   local tab.
7. See a clear disconnected/ended state instead of silently editing a stale
   live tab.

## Wire Contract Requirements

The wire contract must be defined before either host transport becomes product
logic. Version 1 should use bounded, length-prefixed JSON frames because they
are inspectable and easy to fixture across TypeScript and Rust. A later version
may change encoding without changing Script Editor semantics.

Every frame must contain:

- protocol identifier;
- protocol version;
- session ID;
- message type;
- sender endpoint ID;
- monotonically increasing message or revision number where applicable;
- payload;
- bounded timestamp only when it serves user-visible presence or diagnostics.

Required message types:

- `join`: participant presents the session capability and supported protocol
  versions;
- `welcome`: instructor accepts the participant and reports the current
  revision and permissions;
- `snapshot`: complete UTF-8 content and current revision;
- `edit`: ordered Monaco-compatible edits, base revision, and resulting
  revision;
- `ack`: participant confirms an applied revision;
- `resync-request`: participant reports a missing or invalid base revision;
- `cursor`: optional, throttled instructor cursor/selection presence;
- `participant-state`: optional join/leave/health information;
- `session-ended`: instructor revokes the live session;
- `error`: bounded protocol or authorization failure;
- `ping` / `pong`: transport health where iroh connection state alone is
  insufficient.

Do not use the instructor's file path as a document identifier. The session
should expose a sanitized display name such as `analysis.R` or `Untitled.R`.

## Editing And Revision Rules

- The instructor is the only source of `edit` and `snapshot` frames in version
  1.
- Each edit carries `baseRevision` and `revision`.
- A participant client applies an edit received from the instructor only when
  `baseRevision` equals its current revision.
- A mismatch triggers one `resync-request`; it must not guess, reorder, or
  repeatedly apply the patch.
- Consecutive Monaco changes may be batched for a short interval, but the
  resulting edits must retain deterministic ordering.
- Normal edits should use Monaco edit operations rather than replacing the
  whole model. Full replacement is reserved for initial load or resync.
- Remote application must run with the document's change reaction muted so it
  does not produce a local edit, mark a local file dirty, or form an echo loop.
- Preserve participant selection, cursor, scroll position, and view state when
  applying remote edits whenever Monaco can transform them safely.
- Cursor presence is not durable document state and may be dropped under load.
- A newly joined or reconnected participant always begins from an authoritative
  snapshot before accepting edits.

## Session Capability And Security Rules

An iroh endpoint identity authenticates a peer connection, but it does not by
itself authorize access to a live script. Every sharing session needs a fresh,
unguessable capability secret.

The share ticket must contain, directly or through an encrypted short-code
lookup:

- ticket format version;
- instructor endpoint address information needed by iroh;
- session ID;
- session capability secret;
- protocol version range;
- optional expiry;
- optional sanitized display name.

Security invariants:

- Never include the persistent iroh secret key in a ticket.
- Never log the full session capability or URL.
- Reject `edit`, `snapshot`, or `session-ended` messages from participant
  endpoints.
- Bound frame size, participant count, pending outbound data, and join attempts.
- Expire inactive sessions and allow immediate instructor revocation.
- Do not store script contents on a rendezvous service.
- A short code requires a rendezvous lookup. The returned ticket must be
  protected so the rendezvous service is not treated as the authority to edit
  the document.
- Treat a short code as a temporary bearer credential: normalize only its
  documented separators and case, throttle failed resolution attempts, and
  return the same bounded failure for missing, expired, and revoked codes.
- The first release should not persist live script contents after the session
  ends. Ordinary local editor/save behavior remains separate.

## Ordered Implementation Plan

### Phase 0: Confirm Baseline And Freeze Decisions

Why first: dependency and repository facts may drift. Later work is invalid if
the native binding or browser version cannot speak the selected iroh protocol.

Work:

1. Record the current DialogForge Electron, embedded Node, N-API, packaging,
   and target-platform versions.
2. Record the exact Verzan `@number0/iroh` version and native optional binaries.
3. Repeat the native load/endpoint/shutdown diagnostic without copying Verzan
   source into DialogForge.
4. Identify the exact current Rust iroh version intended for the WebAssembly
   project.
5. Prove or disprove wire compatibility between the native JavaScript binding
   version and the intended Rust/WebAssembly version with the smallest echo
   experiment.
6. Decide whether version 1 uses the Verzan N-API binding or a same-version
   native Rust sidecar.
7. Record the decision and evidence in this document.

Acceptance gate:

- A native endpoint and a browser/WASM candidate can exchange one framed
  message, or the plan explicitly switches both sides to compatible iroh
  versions before feature code begins.

Stop condition:

- Do not build Script Editor collaboration on two iroh versions whose wire
  compatibility has only been assumed.

#### Phase 0 Decision And Evidence (2026-07-18)

Baseline recorded from the current checkout:

- `package-lock.json` resolves Electron 22.3.27. Its embedded runtime reports
  Node 16.17.1, N-API 8, module ABI 110, macOS, and arm64.
- `package-lock.json` resolves `electron-builder` 26.9.0.
- the base packaging configuration produces a macOS arm64 DMG locally,
  Windows x64 NSIS and standalone executables, and a Linux x64 AppImage.
  Product packaging also retains the CI-owned macOS x64 path.
- Verzan resolves `@number0/iroh` 0.35.0 and Electron 39.2.7. The iroh package
  declares Node 20.3 or newer and N-API 8. Its optional native packages cover
  macOS arm64/universal, Windows x64/arm64, Linux x64/arm64/arm GNU and musl,
  and Android arm64/arm.
- Rust `iroh` 0.35.0 is the browser candidate for protocol version 1. It is
  the same core version used by the native binding and supports
  `wasm32-unknown-unknown` browser endpoints over relay WebSockets.

The compatibility diagnostic lives under
`internal/diagnostics/live-script-iroh-phase0`. It intentionally does not
import Verzan source or application behavior. The accepted run used:

- Rust 1.91.0 with the `wasm32-unknown-unknown` target and Homebrew LLVM for
  ring's browser build;
- `wasm-bindgen` 0.2.100;
- `@number0/iroh` 0.35.0 from the Verzan installation, loaded by DialogForge's
  Electron binary with `ELECTRON_RUN_AS_NODE=1`;
- headless Chromium from DialogForge's pinned Playwright dependency;
- ALPN `dialogforge/live-script/1` and a 64 KiB frame bound.

The native peer advertised its relay address, the browser peer connected to
that address, and both sides reported the exact echoed frame:

```json
{"protocol":"dialogforge/live-script","version":1,"type":"ping"}
```

Decision: version 1 will use the pinned `@number0/iroh` 0.35.0 N-API binding
and matching Rust `iroh` 0.35.0 browser client. The native addon remains an
optional Electron capability because its package-level Node engine declaration
does not support Electron 22 even though the N-API 8 runtime proof succeeds.
Phase 2 must load it lazily and fail closed. A same-version native Rust sidecar
is the fallback if a supported packaged target fails; it is not selected for
the first implementation.

### Phase 1: Define The Host-Neutral Live-Script Contract

Why now: editor semantics and authorization must not emerge accidentally from
the first native transport implementation.

Work:

1. Add `src/script-editor/collaboration/`.
2. Define versioned TypeScript frame types and strict parsers.
3. Define the session host and participant state machines.
4. Define revision, batching, acknowledgement, resync, and end-session rules.
5. Define sanitized metadata and session-ticket types.
6. Add language-neutral fixture files that the future Rust project can consume.
7. Add malformed, oversized, unauthorized, stale-revision, and duplicate-frame
   cases.
8. Define a `LiveScriptTransport` interface without Electron, browser, Monaco,
   product, or runtime-provider imports.

Acceptance gate:

- Two in-memory transports can host, join, receive a snapshot, apply ordered
  edits, detect a missed revision, resynchronize, and end a session.

Stop condition:

- Do not add iroh imports to `src/script-editor/collaboration`.

### Phase 2: Prove Native iroh Transport In DialogForge

Why now: Verzan proves the general native pattern, but DialogForge packaging,
process lifecycle, and IPC are different.

Work:

1. Add the exact pinned native dependency selected in Phase 0.
2. Add an Electron-owned iroh endpoint controller under
   `src/shell-electron/collaboration/`.
3. Register a DialogForge-specific ALPN such as
   `dialogforge/live-script/1`.
4. Persist the application iroh identity under Electron `userData`, separate
   from product repositories and document sessions.
5. Implement bounded framed messages on a long-lived connection. Do not use a
   new bidirectional stream for every keystroke.
6. Implement host, join, send, connection-state, and close methods behind the
   shared transport interface.
7. Add owner-local typed IPC between Electron main and the existing Script
   Editor renderer.
8. Close all sessions and the endpoint during application shutdown.
9. Keep rendezvous out of the first native proof: exchange the complete ticket
   directly.

Acceptance gate:

- Two installed DialogForge instances with separate `userData` directories can
  establish a session and exchange protocol fixtures without involving Monaco.

Stop condition:

- If the native addon breaks packaging or startup, make collaboration
  capability detection fail closed. Do not make the base app depend on a
  successfully loaded native addon.

### Phase 3: Implement Shared Single-Writer Synchronization

Why now: transport is useful only after the existing Script Editor can consume
it without regressing normal editing.

Work:

1. Add a host-neutral live-session controller under
   `src/script-editor/collaboration`.
2. Add a renderer adapter that observes the instructor Monaco model.
3. Convert Monaco content-change events to ordered protocol edits.
4. Add a participant shared-tab document type without creating a second editor
   implementation.
5. Apply remote edits while muting local change reactions.
6. Keep shared participant tabs read-only while retaining selection, copy, and
   existing Ctrl/Cmd+Enter behavior.
7. Preserve selection, cursor, scroll, and editor view state.
8. Implement authoritative snapshot and resync replacement.
9. Ensure participant live tabs do not enter ordinary file-session restore and
   do not expose the instructor's path.
10. Implement `Make editable copy` as an ordinary local Script Editor tab.

Acceptance gate:

- With in-memory transport, one editor can make insertions, deletions, pastes,
  undo/redo changes, and full replacements while a participant remains in
  sync; the participant can execute selected code locally and no code executes
  merely because it arrived.

Stop condition:

- Do not call `model.setValue()` for every edit. Do not reuse ordinary dirty
  file state as collaboration state.

### Phase 4: Add And Verify Installed-App Sharing UI

Why now: user-visible workflow should be added only after transport and editor
semantics are stable.

Before editing UI, inspect and preserve the exact current Script Editor HTML,
CSS, assets, toolbar, tab strip, Monaco styling, and renderer functions.

Work:

1. Add `Share live` to the existing Script Editor action surface.
2. Add a compact session panel using existing DialogForge dialog/window styles.
3. Show the QR code, copyable link, short-code state, participant count,
   connection state, and `Stop sharing` action without presenting any one join
   method as universally available.
4. Add `Join live script` to an appropriate shared menu or Script Editor entry
   point.
5. Label participant tabs as live/read-only without replacing existing tab
   geometry or icons with approximations.
6. Add optional instructor cursor broadcasting and participant
   `Follow instructor cursor`.
7. Add clear ended, disconnected, reconnecting, and incompatible-version
   states.
8. Add shared translations; product repositories may override only text they
   own.

Acceptance gate:

- In the rendered installed application, an instructor shares a real tab, a
  second instance joins, edits update visibly, Ctrl/Cmd+Enter executes only on
  the participant, detaching creates an editable copy, and stopping the session
  visibly ends it.

### Phase 5: Harden Native Sessions And Packaging

Why now: the browser project should target a stable protocol rather than a
native proof that has not survived network and packaging failures.

Work:

1. Add reconnect with bounded backoff and a single snapshot resync.
2. Handle instructor sleep, network changes, relay fallback, participant
   disappearance, duplicate frames, and out-of-order frames.
3. Add expiry, revocation, participant limits, frame limits, and log redaction.
4. Keep complete tickets usable without rendezvous, then add provider-neutral
   publish, resolve, and revoke operations for short classroom codes.
5. First render and verify the full-ticket QR workflow, including scan/open and
   the secondary copyable link, without any rendezvous dependency.
6. Implement the first short-code rendezvous with a Cloudflare Worker
   and one strongly consistent Durable Object per live session. Do not use
   Workers KV for live code creation or revocation.
7. Implement the spoken three-word code contract, including the curated and
   versioned vocabulary, input normalization, atomic collision retry,
   instructor regeneration, lookup throttling, and indistinguishable failure
   responses.
8. Add expiry alarms and delete all stored session data when the ticket expires
   or the instructor revokes it.
9. Define the equivalent small self-hosted rendezvous contract for Hetzner so
   Cloudflare remains replaceable.
10. Store only short-lived encrypted/opaque ticket data; never store script
   contents.
11. Verify native dependency packaging and ASAR behavior on macOS arm64/x64,
   Windows x64, and Linux targets supported by the products.
12. Verify signed/notarized packaging separately from ordinary unsigned local
   packaging.
13. Measure edit latency and memory for realistic scripts and participant
    counts.

Acceptance gate:

- Installed-to-installed sharing survives disconnect/reconnect and packaged
  smoke tests on every supported platform without affecting application startup
  when collaboration is unavailable.

### Phase 6: Create The Separately Versioned Rust/WebAssembly Client

Why now: the native contract is stable enough to implement once in a browser
transport component rather than repeatedly changing Rust and TypeScript APIs.

Repository rule:

- Create a separate repository/project only after explicit user authorization.
  Use a neutral working name such as `DialogForgeIroh` until the final public
  package name is chosen.

Work in the separate project:

1. Pin the Rust toolchain and iroh-related crates with a committed lockfile.
2. Compile the same client to `wasm32-unknown-unknown` with `wasm-bindgen`.
3. Use browser-compatible encrypted relay/WebSocket connections.
4. Implement only endpoint lifecycle, ticket import/export, bounded frame send,
   receive events, connection state, and shutdown.
5. Consume the shared protocol fixtures exported by DialogForge or maintained
   in a versioned protocol package. Do not hand-copy evolving JSON examples.
6. Expose a small JavaScript API that implements DialogForge's transport
   boundary.
7. Generate reproducible JavaScript glue, TypeScript declarations, WASM, a
   version manifest, checksums, and license metadata.
8. Add a command-line/native test peer for interoperability diagnostics.
9. Test a browser client against the exact native implementation pinned in
   DialogForge.
10. Document relay configuration and self-hosted relay compatibility.
11. Deploy a test `iroh-relay` on Hetzner and prove that both native and browser
    peers can use it as an encrypted fallback.

Acceptance gate:

- A browser fixture joins a native fixture, authenticates a session, receives a
  snapshot and edits, requests resync, and observes session termination using
  the committed production artifacts.

Stop conditions:

- Do not embed Script Editor or runtime semantics in the Rust project.
- Do not publish an artifact whose protocol version is inferred from its npm or
  crate version. Carry the explicit wire protocol version.
- Do not assume the latest Rust iroh release interoperates with the selected
  N-API binding; retain the Phase 0 compatibility proof in automated coverage.

### Phase 7: Integrate Browser Participants

Why now: the browser consumes a proven, versioned artifact and does not become
the place where collaboration semantics are invented.

Work:

1. Add the Rust/WebAssembly artifact to the DialogForge web build through a
   pinned manifest/checksum.
2. Lazy-load it only when the user shares or joins a live script.
3. Add a browser host transport adapter under `src/shell-web`.
4. Reuse the existing Script Editor page and shared collaboration controller.
5. Route session links into `Join live script` without granting unrelated
   browser permissions.
6. Support installed instructor to browser participant first.
7. Add browser instructor hosting only after the installed-to-browser path is
   stable; browser hosting remains relay-based.
8. Surface relay/network failures clearly and preserve the last acknowledged
   read-only snapshot.
9. Ensure web deployment includes the WASM MIME type, cache/version policy,
   required headers, and subresource paths.

Acceptance gate:

- In a rendered browser, a participant joins an installed instructor, receives
  live updates in the existing Script Editor, preserves selection, executes
  locally through WebR, reconnects, detaches, and observes session termination.

### Phase 8: Verify Mixed-Host Classrooms And Decide Fan-Out Transport

Why now: direct instructor-to-participant connections are the simplest proven
version. Fan-out should change only if measured classroom behavior requires it.

Work:

1. Test these matrices:
   - installed instructor to installed participants;
   - installed instructor to browser participants;
   - installed instructor to a mixed group;
   - browser instructor to installed participants, if browser hosting is
     enabled;
   - browser instructor to browser participants, if browser hosting is enabled.
2. Define the supported classroom-size target before load testing.
3. Measure end-to-end edit latency, instructor upload, relay traffic, memory,
   reconnect storms, and slow-participant backpressure.
4. Test rapid typing, large paste, undo/redo, full resync, instructor sleep,
   expired ticket, revoked session, and version mismatch.
5. Test a spoken code transcribed with upper/lower case, spaces, hyphens, and
   repeated whitespace; also test atomic collision retry, regeneration,
   expiry, revocation, failed-lookup throttling, and indistinguishable lookup
   failures.
6. Run a small human transcription check in each approved classroom language:
   one person reads generated codes without showing them and another enters
   them. Reject vocabularies with recurrently confused words before release.
7. If one connection per participant meets the target, retain it.
8. If it does not, evaluate `iroh-gossip` for edit/cursor broadcast while
   retaining direct authenticated snapshot and resync channels.
9. Do not introduce multi-writer CRDT behavior as a performance fix.

Acceptance gate:

- The selected topology meets the documented classroom-size and latency target
  in mixed native/browser testing, or the remaining scale limit is explicit and
  approved.

### Phase 9: Release, Document, And Enable The Capability

Why last: capability defaults and public documentation must describe verified
behavior, not the intended design.

Work:

1. Add host capability negotiation and settings/policy defaults.
2. Decide whether sharing is enabled by default or opt-in per product or
   deployment.
3. Document relay/rendezvous privacy, session expiry, and the fact that received
   code never executes automatically.
4. Add end-user instructions for QR, delivered-link, pasted-ticket, and
   computer-only short-code joining, plus detach, reconnect, and stop.
5. Add administrator instructions for self-hosted relay/rendezvous deployment
   if supported.
6. Update `internal/migration/current-status.md` with the final ownership and
   verified host matrix.
7. Update product parity records only if a product-specific divergence exists.
8. Package and verify the Rust/WebAssembly artifact version alongside the
   DialogForge release.

Acceptance gate:

- The capability is documented, packaged, rendered-verified, and enabled only
  on hosts that passed the supported matrix. A release described as
  classroom-ready must include a working short-code path for participants who
  have only a computer and no delivered link.

## Deferred Features

Do not pull these into version 1 without explicit approval:

- simultaneous multi-writer editing;
- making the synchronized participant tab editable;
- remotely triggered execution;
- shared runtime state or shared console output;
- persistent cloud storage of scripts;
- recording or replaying a teaching session;
- voice/video/chat;
- automatic participant discovery without a ticket or approved rendezvous;
- transferring arbitrary files through the live-script protocol.

If multi-writer editing is later approved, evaluate a text-oriented CRDT such
as Automerge over iroh. `iroh-docs` is useful for distributed key/value state
and synchronization but is not by itself a text-editing CRDT.

## Known Risks And Required Responses

| Risk | Required response |
| --- | --- |
| `@number0/iroh` declares Node 20.3+ while Electron 22 embeds Node 16 | Keep the native load/runtime diagnostic, fail capability initialization safely, verify packaged targets, and be prepared to upgrade Electron or use a native sidecar |
| Native binding and Rust/WASM client use incompatible iroh versions | Stop in Phase 0; align versions or use the same Rust core on both sides |
| Browser cannot establish a direct connection | Use encrypted iroh relay/WebSocket transport and report relay state accurately |
| Slow participant causes instructor memory growth | Bound queues, disconnect or resync slow peers, and never retain unbounded edit history |
| Large paste exceeds frame limits | Batch or send an authoritative snapshot under a bounded snapshot policy |
| Remote edits disturb cursor or selection | Apply Monaco edits through the shared renderer adapter and preserve view state; use full replacement only for resync |
| Session ticket leaks | Use short-lived capabilities, redact logs, allow immediate revocation, and never reuse a session secret |
| Rendezvous service becomes an application server | Store only opaque short-lived ticket material; keep script bytes end-to-end over iroh |
| Cloudflare Workers KV returns a missing or stale classroom code | Do not use KV for live rendezvous; use a strongly consistent per-session Durable Object or the self-hosted rendezvous contract |
| A hosting provider becomes a protocol dependency | Keep full tickets functional, use provider-neutral rendezvous interfaces, and configure relay URLs outside the wire contract |
| Collaboration breaks normal editing | Keep the feature optional, reuse the existing editor, and run ordinary open/save/dirty/run regression checks in every visible slice |
| Browser artifact drifts from DialogForge protocol | Pin manifest/checksum and run shared fixtures plus mixed-host interoperability before release |

## Verification Matrix

Verification must be proportional to the phase and must include rendered checks
for every user-visible slice.

### Contract And State Tests

- frame parsing and version negotiation;
- authorization and role enforcement;
- revision sequencing and batching;
- duplicate, stale, missing, malformed, and oversized frames;
- resync and session termination;
- ticket parsing, expiry, and redaction;
- TypeScript/Rust fixture equivalence.

### Monaco Behavior

- insertion, deletion, paste, replace, undo, and redo;
- multi-change Monaco events;
- selection and cursor preservation;
- scroll/view-state preservation;
- read-only selection and copy;
- local Ctrl/Cmd+Enter execution;
- no execution on receive;
- no dirty state from remote edits;
- detach to editable local copy.

### Network Behavior

- direct native connection;
- native relay fallback;
- browser relay connection;
- disconnect/reconnect;
- missing revision and resync;
- instructor shutdown and explicit stop;
- expired/revoked ticket;
- participant backpressure;
- incompatible protocol and iroh versions.

### Rendered Host Behavior

- real Electron instructor and participant interaction;
- real browser participant interaction through the built WASM artifact;
- mixed Electron/browser session;
- visible participant count and connection state;
- visible ended/error/reconnecting states;
- unchanged ordinary Script Editor styling and workflows.

### Packaging

- unpacked development run;
- packaged macOS arm64/x64 as supported;
- packaged Windows x64;
- packaged Linux target;
- web production build with correct WASM loading and caching;
- missing/failed native binding leaves the base application usable.

## Agent Operating Procedure

At the beginning of every dedicated implementation turn:

1. Read `AGENTS.md` completely.
2. Read this roadmap completely.
3. Read `internal/architecture/overview.md` and
   `internal/migration/current-status.md`.
4. Inspect the current working tree and preserve unrelated user changes.
5. Restate the status ledger using `done`, `partial`, `not started`, or
   `deferred`.
6. Select the earliest incomplete phase whose prerequisites are satisfied.
7. Name the exact files and existing behavior that will be preserved.

During implementation:

- Complete one bounded slice at a time.
- Keep protocol fixtures and both language implementations synchronized.
- Keep Electron and browser code behind host adapters.
- Do not claim visible work is complete without rendered interaction.
- Do not run broad verifier scripts unless the user explicitly requests them;
  use targeted source, build, and rendered checks allowed by the repository
  instructions.
- Record new architectural decisions in this document rather than leaving them
  implicit in code.
- If a phase exposes an invalid assumption, mark it `blocked`, record the
  evidence and alternatives, and stop for user direction.

After every slice, report:

- **Done**: files and behavior completed;
- **Still open**: remaining items in the current phase;
- **Deferred**: approved deferrals only;
- **Next**: the next exact slice from this roadmap;
- **Verification**: what was exercised and what was not.

Do not report a completion percentage. Do not skip ahead to browser UI before
native transport, shared semantics, and Rust/native interoperability are proven.

## Suggested Dedicated-Task Opening Prompt

Use this in a new task when implementation should begin:

> Implement the live Script Editor sharing roadmap in
> `internal/live-script-sharing-iroh-roadmap.md`. Start with the earliest
> incomplete phase, preserve the status ledger, follow the stop conditions,
> and complete only the next bounded slice with the required verification.
> Continue phase by phase only when each acceptance gate is genuinely met.

## Primary References

DialogForge:

- `AGENTS.md`
- `internal/architecture/overview.md`
- `internal/migration/current-status.md`
- `internal/contracts/dialog-products-parity.md`
- `src/script-editor/state/scriptDocument.ts`
- `src/script-editor/renderer/scriptExecutionController.ts`
- `src/script-editor/renderer/scriptEditorCompositionRoot.ts`
- `src/shell-web/browserScriptEditorSurface.ts`
- `src/shell-electron/script-editor/`

Verzan:

- `/Users/dusadrian/Documents/GitHub/Verzan/src/modules/p2p/p2p.ts`
- `/Users/dusadrian/Documents/GitHub/Verzan/src/modules/p2p/p2p_app.ts`
- `/Users/dusadrian/Documents/GitHub/Verzan/src/modules/p2p/p2p_specific.ts`
- `/Users/dusadrian/Documents/GitHub/Verzan/package.json`

Iroh:

- `https://docs.iroh.computer/compatibility`
- `https://docs.iroh.computer/protocols/documents`
- `https://docs.iroh.computer/protocols/writing-a-protocol`
- `https://docs.iroh.computer/add-a-relay`
- `https://github.com/n0-computer/iroh-examples`
- `https://developers.cloudflare.com/durable-objects/concepts/what-are-durable-objects/`
- `https://developers.cloudflare.com/durable-objects/platform/pricing/`
- `https://developers.cloudflare.com/kv/concepts/how-kv-works/`

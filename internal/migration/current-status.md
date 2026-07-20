# Current Status

## Canonical Records

Current product parity is tracked in:

- `internal/migration/dialogr-parity-audit.md`
- `internal/migration/dialogqca-parity-audit.md`

This file is only a short implementation summary. It is not the parity source
of truth and does not replace source comparison with DialogR or DialogQCA.

## Product Rewrite State

DialogForge is the active structured rewrite of DialogR and DialogQCA. The
reference applications remain the behavior and styling oracles; DialogForge
changes ownership boundaries and internal structure without redesigning the
products.

The shared application owns the console, workspace pane, Data Editor, Script
Editor, import, help, plot viewer, settings, menus, lifecycle, and runtime
provider contracts. Product code owns product dialogs, product capabilities,
startup behavior, metadata, locales, and product-specific runtime adapters.

Application locale changes follow the retained DialogR live-update contract:
the selected locale is persisted, translated composition data and the native
menu are rebuilt in place, and open renderer windows receive the language
event without restarting the application or runtime. Language-menu entries use
each locale's own display name rather than translating names through the
currently selected UI locale.

DialogR and DialogQCA product CustomJS preservation monoliths have been removed.
Their behavior is now rewritten into explicit typed domain modules, while each
`customJSRuntime.ts` file is limited to controller construction and external
call registration.

## DialogR

The current DialogR surface includes:

- the DialogR console flow, Monaco input, history, completion, contextual help,
  prompt handling, interrupt, toolbar, and zoom behavior;
- the external right-side workspace pane with persisted expansion, active
  dataset state, object actions, and Data Editor opening;
- the two-pane virtualized Data Editor with background schema and metadata
  loading, real R mutations, clipboard behavior, metadata, value labels,
  declared missing values, row names, and column names;
- the separate Script Editor with restored tabs and contents, dirty-state
  prompts, file handling, Monaco styling, functions, help, and run behavior;
- DialogR import, help, plot, settings, about, menu customization, package,
  restart, workspace restore, crash recovery, and child-process cleanup flows;
- typed product dialog modules for dataset state, sorting, summary commands,
  workspace bindings, dataset-editor refresh, and the expression editor.

The external DialogR product also has a `goto.json` dialog that is not present
in the ten reference DialogR profile dialogs. It implements the existing Go to
case/variable commands and is an explicit product addition introduced during
the rewrite, not an unmapped reference artifact.

DialogR also owns the console projections for its weight-by and split-by
dataset state. The shared console renders generic product-contributed state
chips, but it does not know those DialogR concepts or their dialog mutation
calls.

## DialogQCA

The external DialogQCA product contribution composes the shared DialogR-aligned shell and owns
the seven reference QCA dialogs, QCA startup/package behavior, truth-table
integration, calibration, XY plotting, and Venn behavior.

DialogQCA dialog behavior is separated into typed modules for:

- threshold state and calibration dialog state;
- calibration preview rendering and plot interaction;
- XY plot dialog state and rendering;
- Venn dialog state and rendering;
- truth-table discovery and workspace integration;
- dataset variable/value access;
- shared product-dialog UI controls;
- product external-call transport.

## Runtime And Packaging

The R provider owns real runtime-control execution, workspace inspection and
mutation, tabular reads and writes, help, completions, package checks, prompts,
restart/restore, and process lifecycle. The shared app consumes those operations
through provider-neutral contracts and capability negotiation.
Console `help.start()` requests are routed to the app-owned Help surface in both
Electron and browser hosts instead of launching a system browser. Desktop R and
WebR pager output is likewise returned through the shared console transcript, so
commands such as `demo()` remain inside the application.
Local runtime providers can now expose a provider-neutral location controller.
Settings always shows the exact resolved R executable, distinguishes automatic
discovery from a user-pinned path, provides a native executable picker, and
persists machine-specific overrides in the user settings layer. R session and
help startup both honor the selected location, while clearing the override
returns to automatic discovery without pinning the currently detected version.
The Settings Rediscover action performs a fresh provider-owned scan, allowing
installations added while DialogForge is running to appear immediately. It
retains the current configured or automatically resolved path when the scan
fails. The provider-specific Detect runtime at startup checkbox now makes the
selection mode explicit: checked uses automatic discovery and makes the
resolved path read-only; unchecked makes the custom path authoritative.
Switching modes retains the custom path so a portable runtime preference is not
lost while automatic discovery is temporarily enabled.
Application composition contracts now live under `src/core/contracts`
instead of `src/base-app`, so runtime and shell layers do not depend on UI
ownership for product metadata, startup policy, or capability composition.
Runtime provider registration is a bootstrap concern outside the provider
contract package, and an automated architecture-boundary verifier rejects
shared-to-product imports, runtime-to-base-app imports, provider-contract-to-
provider-implementation imports, and cross-product imports.

Product-owned main-process behavior is composed through the product
contribution registry. The Electron entry point no longer imports DialogQCA
implementation files or branches on DialogR/DialogQCA names for external-call
hosts, package-source selection, runtime autostart, process lifecycle, or
workspace restoration. Package source and runtime startup policies are loaded
from product settings and passed through composition contracts.

Runtime restart orchestration and main-window zoom persistence/shortcut
handling now have shell-owned controllers instead of inline Electron-entry
implementations. The zoom extraction preserves the existing shared factor,
Cmd/Ctrl plus/minus/reset shortcuts, settings persistence, renderer
notification, and cross-window application.

Application quit now coordinates live-script teardown with runtime shutdown.
An open Script Editor first revokes hosted classroom codes, publishes an
instructor-closed terminal frame, and detaches participant sessions. Electron
then waits for the native iroh sessions and endpoint to close before resuming
quit, preventing native Tokio work from surviving Node teardown. Closing only
the Script Editor performs the session teardown but leaves the application
endpoint available for a later editor window.

The shared Script Editor now owns single-writer Live Script Sharing across
Electron and browser hosts. Presenters publish authenticated snapshots, edits,
and cursor state over direct iroh connections; participant tabs remain
read-only during the session, never execute received code automatically, and
become unsaved editable local documents after permanent termination. The
three-word invite-code service is provider-neutral and separate from encrypted
iroh relay traffic. Hosting and joining are enabled by default only when the
host capability is available, with a deployment-level disable policy and
replaceable rendezvous origin.

The supported controlled classroom target is 30 participants, with measured
mixed installed/browser matrices for both installed and browser presenters.
The 50-participant runs are recorded stretch evidence, not a release guarantee.
Direct presenter fan-out remains selected because synchronization, edit
latency, memory, reconnect storms, and slow-participant isolation met the
target. The pinned DialogForgeIroh 0.1.0 Rust/WebAssembly artifact owns browser
transport only; Script Editor state and authorization remain in DialogForge.

All statically known Electron request routes, one-way commands, and renderer
events now use owner-local typed IPC maps shared by preload, renderer, and
main-process registration. This covers application composition, settings,
history, runtime/session/query/help/package/import operations, shell filesystem,
clipboard/window/plot operations, Dataset Editor compatibility routes, Script
Editor routes, dialog-runtime routes, product-dialog routes, and application
events. A source audit rejects new static IPC channel literals. The sole
intentional exception is the `send-to` compatibility forwarder, whose target
channel is dynamic imported-dialog data and therefore cannot be represented by
a fixed DialogForge route map. The implementation deliberately avoids a proxy
RPC framework while the explicit Electron contracts remain stable and
testable.
Provider-neutral runtime/session IPC for session lifecycle, visible and product
commands, workspace actions, runtime events, prompts, startup tasks, object
inspection, and active-dataset selection now has a runtime-session owner;
Electron composition supplies the publication, baseline, warm-cache, and
broadcast callbacks. Provider-neutral IPC for completions, dependency checks,
invisible queries/mutations, and runtime extension methods now has a
runtime-query owner; Electron composition supplies only workspace-baseline and
workspace-refresh callbacks for extension methods that change workspace state.
Help topic lookup, document retrieval, command URL routing, R help page fetch
forwarding, and help-example execution now have a runtime-help IPC owner while
the shell still owns the help window lifecycle.

Product-specific Electron entrypoints and static-copy rules support development
and packaged composition. Packaged entrypoints select their staged product
through an explicit environment contract that does not depend on Electron's
platform-specific `process.argv` layout, and packaged metadata exposes the
selected product name to Electron. Product dialog menus open only the native
dialog window; the former inline migration-metadata panel, including its DOM,
styles, close lifecycle, and main-window preview wiring, has been removed.
Packaged dialog windows resolve their renderer from the archive root. Native
dialog windows receive a minimal dialog-runtime preload host, and source-dialog
loading resolves each declared adjacent `script.entry` into the runtime
`customJS` payload. External R sources are resolved from unpacked packaged
resources so the R executable never receives an `app.asar` virtual path.
Linux R discovery also inspects custom installations rooted at `/opt/R`,
including versioned and architecture-nested install roots. Runtime startup now
uses the DialogR console cover to show both progress and the actual failure when
no prompt can be created. The About window deliberately removes the application
menu on every platform because it is an informational child window only.

Product repositories now own the public build entry points for product builds.
DialogR and DialogQCA expose product-local desktop build commands and
product-owned GitHub workflows for unsigned Linux, Windows, and macOS artifacts.
DialogForge remains the shared build engine. Product wrappers determine their
own repository root and hand it to DialogForge internally; product authors do
not supply a product path at the command line.

Official signed Windows releases are handled through DialogForge's private
signing broker workflow because Azure Trusted Signing trusts the
`dusadrian/DialogForge` workflow identity. Product repositories request that
broker with a private maintainer token; they do not authenticate directly with
Azure. macOS packaging is unsigned by default; local signing and hardened
runtime are used only when the caller explicitly passes `--sign`. Local macOS
packaging is Apple Silicon only, while macOS Intel packaging remains a CI-owned
lane. Windows publication creates both the NSIS installer and standalone
executable, without creating or uploading a portable ZIP archive.
Packaged applications stage the complete renderer runtime set, including Preact
and Monaco's DOMPurify and Marked dependencies, and packaging fails before
artifact creation when one of those modules is absent.
Electron auto-update support is a host-owned packaged-app service. Products opt
in by declaring `product.autoUpdate.url` or `product.autoUpdate.releaseRepository`
plus `product.autoUpdate.releaseTag`; DialogForge then writes electron-builder
generic-provider update metadata during product packaging. The running packaged
app checks for updates only when it is packaged and opt-in metadata exists,
asks before downloading, and uses the user-facing action "Restart to install"
after the update has been downloaded. Browser hosts do not participate in this
Electron updater path.

The first web-enabling slice now exists without merging product repositories:
`src/core/host` contains both Node and browser resource clients for the
shared host-adapter contract, `src/shell-web` is the reserved browser-host
owner, `server-r` is registered as a reserved remote runtime provider, and
`webr` is registered as an experimental browser runtime provider.
The local desktop `r` provider remains the implemented R process provider.
Runtime provider selection is now resolved through an explicit host policy:
Electron keeps `server-r` and `webr` hidden from ordinary choices and ignores
persisted web-only provider values for desktop startup, while a future web host
can prefer web-capable providers when a product declares them. Non-local
runtime providers now also have a provider-neutral transport boundary:
`server-r` exposes a remote-session transport, `webr` exposes a worker transport,
and local desktop `r` remains independent from this transport path. The server-R
transport now has a real lifecycle boundary: it accepts an endpoint and injected
connection probe, reports connecting, connected, failed, and disconnected states,
and still rejects command/workspace requests until request routing is
implemented. Endpoint and credential material are host/deployment inputs, not
product metadata; transport snapshots expose only authentication policy and
whether a matching credential was supplied, not the secret itself. Server-R now
also has transport-routed controllers for visible commands, invisible queries,
workspace listing, tabular preview, help, and completions; request routing uses
explicit provider-local method names while local desktop R remains on the
existing process/runtime-control path. WebR now has the same explicit lifecycle
boundary for an in-browser worker: the transport reports startup progress and
failure kinds, accepts injected test probes, and can start the maintained `webr`
npm package in browser hosts that expose WebAssembly workers. Visible commands,
invisible queries, workspace listing, tabular preview, help, and completions
route through worker transport methods, with initial package-backed handling for
commands, queries, workspace listing, tabular preview, and package availability.
Browser package availability and filesystem/persistence policy are now explicit
WebR manifest policies: package availability is worker-runtime state, package
installation uses WebR's WebAssembly binary package repository through a
bootstrap-installed `install.packages()` shim, file access is browser-virtual,
and durable persistence is host-managed rather than assumed to be a native
filesystem path. The `webr` npm package is staged as a runtime dependency so
its JavaScript, worker, WebAssembly, and shared-library assets can be served by
a browser deployment.
The browser DialogR shell exposes the Packages menu, but its installs are
WebR-session scoped. Required packages are still supplied through the browser
WebR package library and virtual filesystem, dialog dependency loading attaches
the needed packages internally, and package-menu install commands use WebR's
temporary in-session package installation path rather than a native persistent
R library chooser.
For token-based student launch sessions, browser dialog variable containers do
not apply variable-type filters when listing the launched dataset's columns.
The workspace pane and Data Editor continue to use the real variable metadata.
The WebR bridge also uses a provider-local operation queue and a shared startup
promise, following the useful MetadataPublisher-WebR runtime pattern while
preserving DialogR's separate visible-command and invisible-query paths. WebR
asset loading now resolves explicit browser deployment URLs and installed or
staged `webr/dist` package assets, so development, built, packaged, and browser
hosts share one provider-level base-resolution path. Node/Electron WebR hosts
also install a guarded Worker path normalization shim before the `webr` package
is imported, preserving the useful MetadataPublisher behavior for `file://` and
Windows-style worker targets without changing browser hosts. WebR filesystem
mounting now has a provider-level boundary for `WORKERFS`, `NODEFS`, and
`IDBFS` requests; the bridge serializes mounts with other runtime operations
while host-owned code remains responsible for native roots and browser virtual
file payloads. WebR startup now accepts an opaque `runtimeBootstrap` plan that
the WebR provider normalizes into mounts, helper source files, and startup
commands, then runs immediately after `webR.init()` through the same serialized
runtime bridge. A WebR package/library policy now converts browser-served
package libraries, helper asset mounts, helper source files, and startup
commands into that bootstrap plan, giving DialogR a concrete way to make its
required packages and helper files available without assuming native paths in a
browser host. WebR visible commands now use captured runtime output to emit
DialogR transcript events in order, while invisible queries use a typed raw
conversion path with a string fallback and never become visible console history.
The WebR provider also owns its lifecycle controller, so runtime session state
now reflects worker transport startup, readiness, failure, and stop transitions
instead of relying on a generic placeholder snapshot.
The external DialogR product metadata now keeps desktop `r` as the explicit
default runtime provider while declaring `server-r` and `webr` as supported
providers for future browser composition.
Provider selection is now surfaced through the host-owned Settings window using
`runtimeProviderSelection` choices. Electron settings receive only visible
provider ids, so ordinary desktop DialogR users still persist local `r` while
web-only providers remain hidden unless selected explicitly through startup
composition.
The browser shell now has its first composition entrypoint: `src/shell-web`
creates a browser host adapter, uses the browser resource client, resolves the
selected product through the normal product-location contract, and composes the
application with `hostKind: "web"`. This does not yet map native dialog windows,
auxiliary windows, or durable browser storage.
Browser storage and file boundaries now live in `src/shell-web`: uploaded
files are represented by browser file references, save operations are modeled as
downloads, and settings/workspace state can persist through a web `Storage`
object without assuming native filesystem paths.
Product dialogs now have a browser-hosted surface boundary. The web shell opens
dialogs as modal overlay frames that load the existing `dialogBuilder.html`
renderer, preserving the `#paper` dialog container, quick-action controls,
`dialogBuilder.css`, and `appCodicon.css` instead of rebuilding dialog controls
for the browser host.
Auxiliary Electron windows now have an explicit browser surface map: settings
and about are browser modals, help and plots are panels, and the script editor
and data editor are browser routes. Several of those surfaces still need
browser-host runtime wiring, but ownership and placement are no longer implicit.
The browser Data Editor now has runtime-backed Data and Variables tabs for the
bundled WebR datasets, including visible cell edits, clipboard cell copy/paste,
variable-label and measurement writes, Variables-column resizing, and a
desktop-style Values-cell affordance that opens a draggable value-label modal
and writes category labels, declared-missing flags, and missing ranges back to
WebR through R's `labels`, `na_values`, `na_range`, and `declared` metadata.

## Web Runtime Code-Sharing Backlog

The browser shell is being realigned with the shared application rather than
treated as a parallel renderer. The governing assessment is
`internal/migration/web_runtime_code_sharing_assessment.md`.

- done: the browser-host and runtime-provider seams exist under
  `src/core/host`, `src/shell-web`, and the `server-r` / `webr` runtime
  provider boundaries.
- done: Phase 1, Node-only helpers have been moved out of browser-safe dialog
  renderer utilities. `src/dialog-runtime/renderer/library/utils.ts` and
  its shared type surface no longer import or expose `fs`, `path`, `Buffer`, or
  the dynamic settings module; the old filesystem and window-bounds helpers now
  live in the Node-specific `utils-node.ts` module.
- done: Phase 2, the duplicated console command-preview CSS has been
  extracted from `main.html` and `dialogr.html` into
  `src/base-app/pages/shared/console.css`. The base main-window stylesheet
  has been moved from inline `main.html` CSS into
  `src/base-app/pages/shared/main.css`, and the browser shell's page styles
  have been moved from inline `dialogr.html` CSS into
  `src/shell-web/pages/dialogr.css`. Workspace-pane styling remains shared
  through the existing workspace-pane class contract.
- done: Phase 3, the browser iframe preload bridge now exists in
  `src/shell-web/browserPreloadBridge.ts`. It installs the
  `window.dialogForge.*` renderer contracts used by dialog runtime, Dataset
  Editor, Script Editor, clipboard, and dataset mutation surfaces, then maps
  invoke/send/send-to calls onto host-owned `postMessage` requests. The shared
  dialog, Dataset Editor, and Script Editor iframe pages inject the bridge in
  browser hosts, and the DialogR web shell now handles
  `dialogforge.web-preload` request/response messages for the initial dialog,
  dataset, script, clipboard, visible-command, dialog-created,
  dialog-workspace, command-preview, and script-insertion routes.
- done: Phase 4, browser ESM entry points now compile and load for the shared
  Dialog Builder, Dataset Editor, and Script Editor iframe pages. The browser
  shell emits the shared dialog runtime entry point,
  `src/base-app/modules/datasetEditorInterface.js`,
  `src/base-app/modules/scriptEditorInterface.js`, and the supporting
  browser preload bridge under `dist/browser-esm`, and the web dev server
  resolves extensionless browser ESM imports plus the SortableJS browser
  vendor module. The shared dialog iframe accepts the existing raw DialogCreator
  payload, normalizes it with the shared adapter, and renders through the same
  dialog-runtime controls as Electron.
- done: Phase 5, the DialogR web shell now opens shared iframe surfaces for
  dialogs, Dataset Editor, and Script Editor, and the former
  `browserDialogRuntime.js` duplicate has been deleted. The legacy inline web
  Data Editor and Script Editor renderers have also been removed from
  `dialogr.js`. Unplanned but done: the web shell now also renders the
  workspace pane through the shared `createWorkspacePane` owner while keeping
  the browser host responsible for WebR workspace snapshots, active dataset
  selection, delete/clear commands, and Dataset Editor opening. Browser import
  file selection, staging, preview parsing, and WebR filesystem restoration now
  live in the shell-owned `browserImportAdapter` instead of the monolithic
  page renderer. Help and plot iframe window chrome now route through the
  shell-owned `browserFrameSurface` controller while continuing to load the
  shared `help.html` and `plotViewer.html` pages. The browser shell still owns
  parent-side WebR launch, console host bindings, workspace snapshots, and
  auxiliary help/plot message translation, but those are explicit browser-host
  adapters rather than duplicate iframe renderers.

The current browser `dialogr.js` implementation is now the browser host
composition layer for WebR startup, launch-session handling, menu/dialog
routing, console bindings, and parent-side iframe bridges. It should not grow
new duplicate renderers for shared surfaces. Broader browser hardening remains
outside the code-sharing assessment: Dataset Editor edge coverage, selection
ranges beyond the current cell path, large-viewport parity, and deeper
parent-side host-controller factoring remain governed by the desktop feature
owners and future browser-host adaptation.
Browser rendering also has a first real-surface sentinel:
`verify:browser-rendered-parity` launches Chromium, renders the browser dialog
modal contract, loads the existing dialog-builder page into the frame, and
checks the visible modal geometry, styling hooks, and dialog-builder controls.
DialogR now also has a concrete browser-runnable MVP. DialogR's product-owned
`dev:web` wrapper builds DialogForge, serves the external DialogR product
through `src/shell-web`, and
exposes a browser page that composes DialogR with `webr`, lists DialogR dialogs,
opens a DialogR dialog modal, starts WebR from served package assets, captures
visible command output, and keeps invisible query state out of the visible
transcript. The modal no longer treats the dialog-builder iframe as static only:
when Electron/Node integration is unavailable, `dialogBuilder.html` loads a
browser-native dialog runtime that fetches real DialogR dialog JSON and
`actions.js`, renders controls into `#paper`, executes imported action handlers,
bridges product external calls to the parent page, and routes generated commands
to WebR. Current browser verification proves this path with the DialogR
`frequencies` dialog by selecting `iris` and `Species`, clicking the imported
Run button, and observing the generated `wtable(Species)` command in the WebR
transcript. The verifier now also covers `crosstable`, `onesamplettest`, and
`independentsamplesttest`, proving the shared dataset/variable browser binding
path across four imported DialogR dialogs. The verifier now also covers
`splitby` and `weightby`, proving browser persistence for product-level split
and weight state through imported dialog actions. The remaining browser-dialog
work is the heavier product-dialog group: sort, select, recode, summaries, and
go-to behavior.

A dependency-injection container, an optional tabular-extension registry, an RPC
framework, and a monorepo remain possible future directions rather than current
parity work. They require a demonstrated second platform, provider, or extension
need before their additional abstraction and migration cost is justified.

## Current Engineering State

The TypeScript application build is clean after the DialogR and DialogQCA
CustomJS rewrites. The canonical DialogR and DialogQCA parity ledgers have no
`partial`, `missing`, or `scaffold-pending-rewrite` matrix rows. DialogForge base
verification is product-independent and uses neutral product fixtures. Product
contracts and verifier manifests are owned by the external DialogR and DialogQCA
repositories. Local Electron smoke coverage has exercised both products by
explicit path, including console startup and visible execution, focus shortcuts,
plot lifecycle and history, runtime recovery, Data Editor mutations, and Script
Editor workflows.

Product-repository CI currently validates TypeScript contributions through
`npm run check`; running the product-owned verifier manifests in CI remains open.
DialogForge CI currently builds the base and externally selected products;
running the shared engine contracts in CI remains open.

The fourth architecture evaluation produced another focused cleanup slice.
Product resolution now accepts product contributions only through an explicitly
selected repository path.
Renderer preload globals now live with base-app bootstrap rather than under core.
Dialog external-call ports now live under `src/core/contracts`, and the
architecture verifier rejects core imports into shell and feature layers. Script
Editor request IPC now uses a typed route map shared by preload and main-process
registration. Menu customization modeling has moved out of the Electron entry
point, while DOM lookup and product preview-extension loading have moved out of
the main renderer composition root. The roots remain composition owners and
should continue shrinking through cohesive controller extractions rather than a
generic service container or global event bus.

The main renderer composition root now delegates panel rendering, console and
runtime-session services, workspace behavior, dataset interaction and mutation,
command history, navigation, and shell-command routing to feature-owned
composition modules. The Electron entry point now delegates Script Editor,
Dataset Editor, runtime lifecycle/session/IPC/restart, main-window and workspace
window management, product dialogs, external windows, application-support
windows, shell IPC, and application lifecycle binding to their owning layers.
These extractions preserve the existing product behavior and the approved Data
Editor warm-cache/first-paint path; the remaining entry-point code is explicit
top-level product, runtime, and host composition.

The current rewrite pass is converting preserved runtime and renderer
monoliths into behavior-owned modules without changing their DialogR contract.
The R dataset state, viewport, mutation, declared-missing, metadata,
variable-pagination, and import-preview domains are now structured in
`runtimeDatasetStateCore.R` and `runtimeDatasetCore.R`.

The R prelude, workspace, dataset, completion, help, dependency, event, prompt,
graphics, warning, dispatch, and backend domains are now DialogForge-owned
rewrites. DialogQCA calibration, XY plot preview, threshold discovery, and truth
table inspection are loaded from the product-owned R runtime profile rather than
the shared R provider. Request decoding and response serialization are owned by
`runtimeTransportCore.R`; `runtimeControlBootstrap.R` is now limited to runtime
startup, socket lifecycle, callback registration, idle scheduling, and the
request loop. The TypeScript runtime process composer now delegates workspace,
query, import, dependency/help/completion, product-command, extension,
tabular-metadata, and tabular-mutation behavior to explicit controllers rather
than carrying those domains inline.

Provider-neutral fallback tabular rows, row names, provenance, variable
metadata, value labels, declared-missing values, and their rename/remove/clear
lifecycle now have a dedicated session-state owner. The runtime session manager
continues to decide provider-versus-fallback routing without maintaining six
parallel object-state maps directly.
Bounded provider-neutral runtime-event history and the nonblocking fallback
prompt queue now also have dedicated session-state owners. Live R prompt
transport remains owned by the R protocol/client path; the manager retains only
session-readiness checks and provider-versus-fallback composition.
Cached workspace snapshots, defensive workspace-object cloning, active-dataset
identity, refresh reconciliation, explicit selection, imported-dataset
selection, removal clearing, and rename propagation now have a provider-neutral
workspace-state owner. The session manager retains provider calls and runtime-
event publication around those transitions.
Provider-neutral session snapshot transitions and lifecycle generations now
have a dedicated lifecycle-state owner. Start/stop still invalidate cached
workspace state, but stale asynchronous lifecycle results are committed only
when their generation remains current, and all public snapshots remain cloned.
Composed dialog and startup-task lookup now has a provider-neutral registry
owner, including owner-qualified identity matching. Placeholder invisible
mutation storage also has a dedicated fallback-state owner that returns cloned
snapshots to invisible queries instead of exposing its internal map.
Provider-neutral fallback import execution now has a tabular-data owner for
supported-format checks, overwrite conflicts, delimited-file parsing,
placeholder rows, provenance registration, and transcript/result construction.
The session manager retains provider routing plus post-registration workspace,
active-dataset, and runtime-event composition.
Provider-neutral fallback help, symbol completion, and dependency-check results
now implement the existing runtime tool-controller contract in a dedicated tool
owner. Session readiness, capability negotiation, input validation, and real
provider dispatch remain in the manager.
Runtime tool provider/fallback dispatch for help, symbol completions, and
dependency checks now has a runtime-tools execution owner. The session manager
retains readiness, capability, and request-shape validation before delegating
accepted requests.
Provider-neutral fallback invisible query and mutation execution now implements
the existing runtime query-controller contract beside the query protocols. The
controller receives only cloned mutation state and a current workspace-object
count callback; readiness, capability negotiation, validation, and real-provider
dispatch remain session orchestration concerns.
Runtime query provider/fallback dispatch for invisible queries and mutations
now has a query execution owner. The session manager retains readiness,
capability, and request-shape validation before delegating accepted requests.
Runtime tool/query fallback construction, execution-controller composition, and
capability request-controller composition now have a session capability
controller factory.
Provider-neutral fallback visible-command and product-command execution now
implement their existing runtime controller contracts beside the command
protocols. Product fallback dependency reporting receives capability and check
callbacks explicitly through the command controller factory.
Runtime command provider/fallback dispatch for visible commands and product
commands now has a command execution owner. The session manager retains
readiness rejection and product-command runtime-event publication through a
command operation owner before delegating accepted commands.
Runtime cell-write provider/fallback dispatch now has a tabular cell mutation
execution owner. The session manager retains the public command boundary while
the controller preserves provider precedence, fallback row materialization, and
batch result assembly.
Runtime column rename, insert, and remove provider/fallback dispatch now has a
tabular column mutation execution owner. Public readiness and capability
decisions now have a column mutation operation owner; provider precedence and
fallback materialization live beside the column mutation protocol.
Runtime row insert, remove, sort, and row-name provider/fallback dispatch now
has a tabular row mutation execution owner. Public readiness and capability
gates now have a row mutation operation owner while row mutation routing,
fallback materialization, and not-tabular result construction sit with the
tabular-data controllers.
Runtime variable-metadata read/write provider/fallback dispatch now has a
tabular metadata execution owner. Public readiness, capability decisions, and
metadata update normalization now have a metadata operation owner while the
execution controller owns provider precedence, read-only fallback overlays,
fallback materialization, and variable validation.
Runtime value-label and declared-missing read/write provider/fallback dispatch
now has a tabular label-state execution owner. Public readiness, capability,
and variable-existence decisions now have a label-state operation owner while
the execution controller owns provider precedence, read-only overlays, fallback
reads/writes, and provider-side runtime-event publication.
Runtime active-dataset reconciliation, explicit selection, import selection,
workspace-object memory, removed-object clearing, rename tracking, and active
selection runtime-event publication now have a session-level active-dataset
controller. The session manager keeps the public workspace/import operation
boundaries while delegating active dataset state transitions consistently.
Runtime workspace list, remove, rename, and clear public operation handling now
has a workspace operation controller. It preserves readiness handling, remove
and rename validation, active-dataset updates, workspace object memory, and
workspace mutation runtime-event publication while delegating provider/fallback
mutation mechanics to the existing workspace mutation controller.
Runtime lifecycle start/stop execution now has a session-level lifecycle
execution controller, preserving missing-provider handling, generation-local
provider start/stop commits, workspace invalidation, and no-controller fallback
startup/shutdown behavior. Runtime event listing now has a session-level event
list controller that preserves readiness handling and provider/session event
merging.
Runtime prompt listing, prompt requests, and prompt answers now have a
session-level prompt execution controller. The prompt state owner still stores
the queue; the controller owns public readiness handling and provider-id
application for prompt operations.
Runtime dialog and startup-task composition lookup, disabled/not-registered
handling, dialog source/planned runtime-event publication, and delegation to the
dialog/startup execution controllers now have a session-level composition
execution controller. Public dialog/startup readiness, capability, and required-
id checks now have a session-level composition operation controller.
Runtime help, completion, dependency, invisible-query, and invisible-mutation
request readiness/capability/input validation now has a session-level
capability request controller. Provider/fallback dispatch remains in the tool
and query execution controllers.
Provider-neutral fallback workspace listing, object inspection summaries, and
tabular preview result construction now implement the existing workspace-
controller contract. The controller receives composed object and tabular-state
callbacks; real provider controllers and read-only adapters retain precedence.
Composed dialog execution now has a runtime-dialog owner for source-path
resolution, DialogCreator JSON normalization, control summaries, CustomJS and
external-call inventories, host support planning, and non-source planned
results. The session manager retains readiness/capability/registration checks
and runtime-event publication.
Provider-neutral startup-task execution now has a startup owner for dependency
checks, workspace refreshes, configured command execution, failure detection,
runtime-event recording, and execution-result assembly. The session manager
retains session-readiness, task identity, registration, and capability-enabled
validation before delegating an accepted task.
Provider-neutral runtime-extension execution now has an extension owner for
session-readiness and method validation, provider dispatch, and unsupported
result construction. The session manager supplies only the current cloned
session snapshot to that endpoint.
Provider read-only table adaptation and fallback-table composition now have a
tabular-data owner for defensive row cloning, provider preview materialization,
generated columns, imported-table workspace capabilities, provider/imported
object merging, and object-existence checks. Fallback variable-metadata reads,
writes, default construction, and provider-metadata overlays have a neighboring
metadata controller. Tabular controller composition now has a tabular-data
factory that wires read, mutation, metadata, label-state, import, and fallback
workspace controllers while the session manager receives only the composed
operation delegates and workspace callbacks.
Provider-neutral fallback structural mutations now have tabular-data owners for
column rename/insert/remove and row insert/remove/sort/row-name updates,
including conflict and address validation, row-name pairing during sort,
in-memory state mutation, runtime-event recording, and result construction.
Column and row operation controllers own readiness and capability gates;
execution controllers own provider-controller precedence, active-object
resolution, and provider-preview materialization.
Provider-neutral fallback cell mutation and batch-result aggregation now have a
tabular-data owner. Fallback value-label and declared-missing default snapshots,
read-only-provider overlays, cloned state writes, runtime events, and update
results have a shared label-state controller. Label-state operation and
execution controllers own readiness, tabular materialization, variable-existence
validation, capability gates, and provider-controller precedence.
Fallback variable-metadata read snapshots and write results now have a tabular-
data owner for read-only-provider overlays, sample/default metadata, column-
derived metadata, stored patch application, runtime-event recording, and update
result construction. Runtime metadata operations own readiness/capability
checks, metadata update normalization, and variable-existence validation while
provider-controller precedence and materialization remain in the tabular
execution controllers.
Provider-neutral tabular schema and preview reads now have a tabular-data read
controller for provider workspace-controller routing, read-only adapter routing,
fallback preview routing, and schema derivation from previews. The session
manager delegates public schema/preview readiness checks, active-dataset
resolution, and not-ready/no-active response construction to a tabular read
operation controller.
Workspace object inspection provider/fallback routing now has a workspace owner.
Runtime-readiness and object-existence checks now have a workspace inspection
operation owner before delegating an accepted workspace object to provider-
specific or fallback inspection.
Workspace remove, rename, and clear provider/fallback mutation mechanics now
have a workspace mutation owner. Workspace controller composition now has a
workspace factory that wires active-dataset reconciliation, object inspection,
workspace listing, mutation mechanics, and public workspace operation policy.
The workspace operation owner retains request normalization,
invalid/not-found/conflict/unsupported response policy, active-dataset cleanup
or rename propagation, workspace snapshot caching, runtime-event publication,
and final result construction.
Workspace listing provider/fallback source selection, provider plus imported
table merging, and ready-snapshot message construction now have a workspace
list owner. The workspace operation owner retains runtime-readiness rejection,
snapshot caching, first-readable-dataset reconciliation, and the corresponding
active-dataset event publication.
Runtime import execution provider/fallback routing now has a tabular-data owner
for provider dispatch, fallback import registration, import event publication,
and selection intent reporting. Runtime import operation policy now owns
readiness/source/format validation, post-import workspace object composition,
active-dataset state, and workspace-cache application.

The former large Data Editor, Script Editor, console, and Dialog Builder
renderers have been decomposed into behavior-owned DialogForge modules. Their
stable page entrypoints and compatibility boundaries remain thin coordinators;
the parity ledger distinguishes completed source ownership from user-facing
flows that still require current real-application confirmation.

The current Data Editor decomposition assigns cell formatting, visible command
generation, command-memory deduplication/root publication, clipboard payload
identity,
viewport planning and loading, fast
initial-page/schema coordination, dataset-change planning, variable metadata
loading, dataset refresh coordination, value-label draft and modal rendering,
viewport loading/failure/success result application,
schema-failure presentation and refresh-failure state application,
empty/initial-loading/content-loading presentation sequencing,
loaded viewport coordinates, loaded columns/row names/cells/filter flags, and
data-load failure state, dataset schema identity and rendered column widths,
loaded variable-metadata collection ownership and targeted replacement,
current dataset identity and available dataset-list state,
active Data/Variables tab state with chrome synchronization,
value-label summary formatting, Data/Variables table rendering,
value-label modal lifecycle, Variables-grid selection state,
Data-grid selection/edit transition state and edit-only reset semantics,
cross-pane and go-to navigation,
column/row/cell inline-edit commit coordination, data-grid and Variables-grid
interaction composition, row/header edit focus entry, context menus, global
keyboard/window bindings and font-shortcut recognition,
window shortcut state/action projection, resize handling, and outside-click
dismissal coordination,
context-menu view/action binding,
header context-menu paste-state enablement, cell context-menu target routing,
tab/dataset-selector/viewport/value-label control state/action binding and the ordered
context-menu/global-event/outside-dismissal binding lifecycle,
full-column and cell/metadata clipboard
orchestration, active-cell clipboard dispatch,
renderer clipboard/visible-command/state transport, and
external IPC action routing for initialization, language, dataset-list,
open/refresh, filter refresh, dataset changes, and Go To requests, plus
structural row/column mutation workflows. Dataset-editor main-process
compatibility IPC for active-dataset state, dataset-editor active state,
variable-column-width persistence, visible-command execution, refresh
forwarding, Go To forwarding, and the DialogR `consumeGoToContext` fallback now
has a dataset-editor owner; Electron composition supplies the runtime/session,
window, warm-cache, and broadcast callbacks. Data-editor layout constants,
initial-load sizing, initial-page/schema normalization, filter-mask
normalization, first-paint initial-page application with post-paint filter-mask
hydration, Variables-column width defaults, stored-width normalization, and
variable metadata field read/write/persistence classification now also live
under `src/dataset-editor` instead of the page coordinator.
Dataset-editor initialization, dataset-list updates,
locale/app-path state, live language relabeling, filter-state refresh handling,
dataset-open preparation/reset sequencing,
Variables-column width identity/application/persistence,
published dataset identity, active-data-cell clearing, jump-selection clearing,
variable-cell range helpers, loaded data-cell read/replace, variable metadata
paste dispatch, variable-grid DOM host/field lookup and priority-row centering,
dataset-editor root and Data-viewport DOM lookup,
variable-metadata lookup ownership and direct clipboard composition without
nullable page proxies,
variable-metadata load/pause/warmup orchestration,
and targeted variable-row metadata refresh after dataset changes
now have renderer owners.
Variable metadata persistence, rollback, local column rename propagation,
measurement changes, and value-label paste also have shared mutation/render
owners.
Viewport planning/loading/queueing, dataset-open preparation, schema
application/fallback page planning, viewport reload/reset orchestration,
and dataset opening now have renderer
controllers that preserve page-first painting, postpaint schema completion,
stale-open cover ownership, non-blocking initial filter-mask hydration, and
background variable-metadata warm-up. IPC
normalization is assigned to typed
`src/dataset-editor` modules. The reference
HTML/CSS remain unchanged. The feature-owned
`datasetEditorCompositionRoot.ts` now coordinates the typed renderer owners,
while the base-app module is only the stable page entrypoint. The first visible
data request no longer
waits for the schema round trip. It requests a warmed first-page preview when
one is ready, waits
only briefly for an in-flight warmup, and otherwise falls back to the direct
runtime request. Data and Variables first-screen warmups are started when a
dataset becomes active, after import, from workspace snapshots, and as soon as
the editor open path receives the dataset name. Cache entries are invalidated
on workspace, command, and tabular mutation boundaries. The initial data
request contains forty rows and a window-width-derived column count with
overscan so wide first windows are not underfilled; the initial variables
request warms the first forty-eight metadata rows. The main-process warm-cache
lifecycle and provider-to-window schema/content conversion now live under
`src/dataset-editor/main-process`; read-side `datasetViewer:*`
compatibility IPC for schema, content, filter masks, and variable metadata is
registered by a dataset-editor owner. Mutation-side `datasetViewer:*`
compatibility IPC for cells, row and column names, structural row and column
changes, sorting, and variable metadata now has a dataset-editor main-process
owner as well; application composition supplies the same visible-command
policy, cache invalidation, dataset-change publication, and runtime-event
broadcast callbacks. Dataset document retrieval and open IPC also register
through the dataset-editor main-process owner, with composition supplying the
existing warmup, load, and presentation callback. Provider-neutral `base-app:*` tabular IPC for
schema/preview reads, cell writes, row/column mutations, variable metadata,
value labels, declared missing, and data import now registers from
`src/runtime/tabular-data`; Electron composition still owns the publication
callbacks, warm caches, and workspace refresh hooks.
Viewport loading fills any
additional visible width after that paint. Import completion selects the known
target without a serial workspace scan, then refreshes the workspace
independently of editor content loading. This first-paint behavior is an
approved DialogForge performance divergence and the user-confirmed accepted
baseline: preserve it regardless of DialogR's current implementation unless an
equal or faster replacement is explicitly recorded.
Dataset-editor window identity, single-flight page loading, initialization,
zoom synchronization, dataset-list publication, title updates, refresh/change
delivery, go-to routing, and closed-state cleanup now have a main-process
window controller. Its window factory preserves the exact DialogR-derived
dimensions, icon, menu, and persisted-state wiring. Active-dataset selection,
preview and Variables warmups, and every cache invalidation boundary remain in
application composition so the approved first-paint behavior is unchanged.
Renderer opening requests schema only after the initial page has had its
opportunity to paint. The
toolbar dataset selector uses the custom select wrapper with the same arrow
treatment as Variables-pane controls, while preserving toolbar width, border,
background, dimensions, and spacing.

The current Script Editor decomposition assigns session serialization and
restore, tab-open placement, tab-strip rendering, file persistence and dirty
close decisions, R function outline parsing, breadcrumb path models,
dropped-file planning/binding and modern/legacy Electron path extraction,
statement-at-cursor selection/execution,
contextual help, diagnostics planning and active-tab scheduling, Monaco
document ownership, creation-time diagnostics/tab activation, active/background
dirty-change reactions, and editor construction/options, file
open/reuse/save/close/session-restore
coordination, toolbar/workspace shell construction, breadcrumb and
outline popup rendering, shell DOM, breadcrumb directory navigation,
transport-backed script-file opening, file-drop
transport, pre-Monaco code/file queues with preserved open-file-before-insertion
flush ordering, user-selected file cancellation/open routing, clipboard
insertion, dirty-window close
resolution, editor shortcut/paste/scroll bindings, bootstrap locale/session/root
preparation, window-title/path-bar/toolbar/dirty-state view updates,
renderer dirty/open/ready transport, IPC dispatch, close-save coordinator wiring,
bootstrap completion lifecycle, bootstrap shell/Monaco/restore/input-binding
flow, live shell/editor/toolbar/outline/breadcrumb reference state, Monaco
runtime loading/retry, ordered relabel/tab/file/close view reactions, shared
toolbar/keyboard new/open/save/help/outline action semantics, tab ordering,
active-model switching, input shortcut/paste/scroll callback composition,
scroll persistence, explicit tab-close/file-controller binding without nullable
page proxies, session serialization, and IPC
normalization, plus language/app-path state and live relabeling, to typed
`src/script-editor` modules. The feature-owned
`scriptEditorCompositionRoot.ts` now coordinates those controllers and the
Electron/runtime boundaries, while the base-app module is only the stable page
entrypoint. Reopening a path that is already represented by a tab now follows
DialogR exactly: it activates the existing model and never replaces its content
from a later open payload.

Script file path validation, UTF-8 reads and writes, hidden-entry filtering,
directory-first workspace sorting, and stable file-operation results now have a
script-editor main-process filesystem controller. Native open/save dialogs,
script-document retrieval/open/insert/read/list/save IPC, renderer-ready
publication, dirty-state publication, and close-save confirmation now register
through a script-editor main-process IPC controller. Runtime fragment-
completeness checks and ordered batch execution now register through that same
owner while retaining runtime readiness, transcript/workspace publication, and
editor command-boundary notifications. Renderer-assisted
close-save request IDs, timeout handling, result resolution, and send-failure
cleanup have a separate script-editor coordinator shared by window close and
application quit flows.

Script-editor window identity, loaded state, initialization payload delivery,
zoom synchronization, close interception, destruction cleanup, renderer-ready
validation, and pending-work flushing now have a main-process window
controller. The window factory retains the exact DialogR-derived dimensions,
preload, icon, title, and persisted-state wiring. Dialog-originated code
insertion now follows DialogR's pending-insertion behavior: code is queued and
the editor is loaded before delivery instead of being sent to a newly created,
uninitialized window.

The current console decomposition assigns the two-stage transcript/Monaco
surface, runtime-event protocol routing, restart-persistent command history,
toolbar rendering and lifecycle actions, runtime-session start/stop/update
sequencing, startup-task execution, visible-command readiness/history/
completion/busy-state sequencing, completion-provider registration, multi-line
input planning, Monaco input-command/keybinding policy, plain-text paste,
path-completion dispatch, cursor/history command routing, history draft/index/
selection navigation, and visible-input completeness/dispatch/focus transaction
state, plus prompt line-number rendering, Monaco host geometry, runtime-busy
interactivity, typography application, and load-failure presentation,
prompt/session/runtime-busy subscription and race-safe resynchronization, and
Monaco model/editor construction, event/command/paste binding, ready-state
replay, and disposal,
queued input text and focus, history-safe model/selection mutation, contextual
help extraction, selection paste, and focus diagnostics,
runtime-prompt input ownership, including per-prompt clear/focus, password-mode
switching, transcript scrolling, and terminal-state release,
external workspace-pane visibility/window expansion, main window file-drop
routing, R package install/update workflow, and R working
directory/script/workspace file actions to typed owners. Native menu command
dispatch now also has a typed base-app owner that preserves shell, dialog,
product-command, feature, and dataset-command routing outside the page
coordinator. Main-window preload event subscriptions now have a typed binding
owner as well, while the page coordinator retains the behavior-specific event
handlers. Global shortcut/context-menu input, console/runtime/import control
binding, and dataset diagnostic-panel control binding are also separated from
the page coordinator. Import selection, format inference, planning, preview,
execution, and post-import refresh now have a dedicated renderer controller.
Import source planning, format support checks, runtime-preview dispatch,
delimited fallback, and normalized preview failures now have a shared import
file controller; planning plus both preview aliases register through an import
file IPC owner. Post-import broadcast and cache-warmup composition remain in
the provider-neutral tabular owner. Workspace
refresh, inspection, removal, clearing, and active-dataset coordination now
have a dedicated controller while retaining the existing workspace-pane view.
Incremental workspace-event normalization, deduplication, pane merging, and
active-dataset selection are workspace-owned as well. Prompt queue/reply,
startup-task execution, runtime tools, menu command-history state, and
product-command package/dependency routing now also have typed controllers
outside the page coordinator. Console transcript identity, deduplication,
runtime-event routing, bounded event history, and clear/render coordination now
have a console-owned controller. Restart-persistent history normalization,
product/runtime settings-key selection, bounded oldest-first storage, and
read/write persistence now have a console-owned settings store and IPC
registration owner. Main-window file-drop runtime execution and
import handoff now have a file-drop controller. Dataset command dispatch and
clipboard/paste execution across cells, metadata, value labels, and declared
missing values now have dataset-editor renderer controllers. Dataset layout,
viewport controls, column sizing/order, pane and selection transitions,
context-menu delegation, inline-edit lifecycle, and Go To dialog state now
have dataset-editor renderer controllers as well. Main-window cell writes,
variable metadata/value-label/declared-missing mutations, and column/row
structural mutations now have dataset-editor renderer controllers with the
existing validation, confirmations, rendering, and refresh sequencing. The
main dialog host, dialog execution/custom-JS preview lifecycle, selected-command
results, product/runtime results, and feature-entrypoint activation now have
typed base-app controllers while retaining the existing host DOM and preview
renderer. Console surface creation, prompt/session state bridging, interrupt
and completeness requests, visible-command execution, Monaco initialization,
and pre-Monaco keyboard fallback now have a console-owned coordinator.
DialogForge deliberately narrows the inherited DialogR Monaco token lists to
R reserved words and language constants; ordinary base functions and bindings
are colored by their syntactic role instead of being mislabeled as keywords or
constants.
Main-window Data/Variables/value-label/declared-missing table rendering,
selection diagnostics/highlights, and dataset mutation/clipboard result
rendering now have dataset-editor panel controllers that retain the existing
DOM hosts and table builders.
Composition, runtime-session, runtime-event, prompt, product metadata,
application-settings, and startup-task panels now have a typed base-app panel
controller; composition-derived product/runtime state, product preview-extension
loading, command-history scope loading, and product/runtime pill rendering now
have a composition bootstrap controller. Composition boot/rendering,
workspace-pane restore, initial runtime/prompt/active-dataset rendering, UI
binding, console initialization, and DialogR/DialogQCA R-runtime autostart
sequencing now have a main-window startup controller. Dialog close, global
keyboard, main controls, dataset-panel controls, and preload renderer-event
binding order now have a main-window UI binding controller. The page retains
composition state and feature wiring.
Dropped import-file application now routes through the import controller,
workspace-pane creation/snapshot/active-dataset/completion composition has a
workspace-owned coordinator, and main-process renderer events now have a typed
behavior controller above the preload subscription binding.
Import/runtime utility panel rendering, dependency-check execution, and
dataset Go To command prompting now also have feature-owned controllers.
Dialog runtime-requirements selection/rendering and package-map normalization,
merging, persistence payloads, and renderer payload construction now live under
`src/dialog-runtime` while the source-identical page markup remains unchanged.
Product-dialog live-window registration, reuse/focus, sender-to-dialog routing,
close-by-ID, and destruction cleanup now have a dialog-runtime registry.
Product-dialog command/state/close event normalization now has a dialog-runtime
controller, and command updates are published through the preload bridge to the
main renderer. Product-dialog open and command/state/close IPC registration now
also has a dialog-builder owner instead of being registered inline by the
Electron entry point. The source-identical DialogR command-preview pane, hover actions,
syntax coloring, automatic/manual sizing, copy/send actions, and final-dialog
cleanup now have a typed main-window controller.
Product-dialog source resolution, workspace payload construction, saved-position
fixed-size window creation, initialization, reuse/focus, state restoration,
load-before-show sequencing, and closure cleanup now have a dialog-runtime
window controller. Workspace refreshes are cached and routed to targeted or all
open dialogs after the central workspace snapshot changes, preserving DialogR's
live dialog-data behavior.
Product-dialog execution, dependency-gated visible command submission, working-
directory queries, and variable-value queries now register through a dialog-
runtime IPC controller. The controller retains the existing command visibility,
transcript, workspace-refresh, and runtime-event behavior through explicit
main-process service callbacks.
CustomJS external-call IPC registration now also belongs to `src/dialog-runtime`.
Filter-state mutations continue to publish the same cross-window update after
the existing composite src/product host completes.
The delayed Monaco
mount and existing console toolbar/terminal internals remain unchanged.
The feature-owned
`src/base-app/features/main-window/mainCompositionRoot.ts` coordinates the
product, runtime, diagnostics, console, dataset, workspace, and dialog-host
controllers. `src/base-app/pages/main.ts` is now only the stable HTML loader
entrypoint.

Main-window identity, reuse/focus, load, ready-to-show presentation, and
destruction cleanup now have a shell-owned controller. The default window was
corrected from Forge's unrecorded 1040 by 720 immediately-visible startup to
DialogR's centered 800 by 600 window, hidden until `ready-to-show`. Saved window
state remains authoritative after the first launch, and the existing native
workspace-pane expansion continues to add pane width outside the 800-pixel
console baseline. Smoke-mode visibility remains an explicit test-harness
exception. The source-identical main page and styling are unchanged.
Application-composition retrieval now registers through a base-app bootstrap
owner. Developer-diagnostics opening and shell working-directory/home queries
register through a shell application IPC owner; the existing diagnostics
window lifecycle and smoke-mode visibility behavior remain unchanged.

Native workspace-pane expansion, restoration, resize tracking, work-area
clamping, user-resize/user-move protection, and persisted expansion state now
have a shell-owned controller, and native visibility IPC now registers from the
same shell window layer. DialogForge also restores DialogR's missing zoom
resynchronization path: while the pane is visible, a main-window zoom change
remeasures the scaled pane and adjusts only the native width previously added
for it. Maximized/full-screen windows remain OS-managed, and the console layout
is resized after synchronization. No workspace-pane DOM or CSS changed.
Native shell file selection for import, workspace open/save, working-directory
selection, script selection, and path inspection now has a shell filesystem
controller and IPC registration owner that preserve DialogR's native Electron
dialog behavior and the existing DialogForge result shapes. Dataset copy/read
clipboard bridging and its IPC registration now have shell clipboard owners
while retaining the existing `base-app:clipboard-result` publication. Plot
copy/save remains in the plot owner because it also owns plot URL validation,
download, and native image conversion.

R runtime lifecycle transitions now serialize startup at the process-host
boundary and use generation guards at both the host and session-manager
boundaries. Concurrent starts share one process, stop invalidates an in-flight
attachment, per-process diagnostics cannot leak into a replacement session,
and stale start/exit results cannot overwrite a newer stop or restart snapshot.

Dataset variable-metadata requests now carry category values, labels,
declared-missing flags, and missing ranges through the dedicated R transport.
Presence flags deliberately extend the DialogR wire format for every optional
metadata field. Omitted type, measure, label, width, decimals, alignment,
categories, and missing-range values preserve their existing attributes, while
explicit blank or empty values still clear the requested metadata.

The dedicated R codec also preserves the import preview's binary mode,
row-name-column selection, and file encoding. Those options were already owned
by the DialogForge import dialog and R preview implementation but were
previously dropped between them.
The same inventory confirms product contribution parameters are represented,
including DialogQCA's `nth` calibration-threshold alias alongside `count`.

Live R events are now attributed only to the owning `execute_input` request.
Concurrent `reply_prompt` control requests no longer receive copies of the
visible command's input, stream, prompt, state, plot, workspace, or completion
events. Parentless prompt-state refreshes remain attached to the sole active
visible execution, while session-level events continue through the global
runtime-event callback.

Plot-viewer state, fresh-runtime-event identity, window reuse, load and
ready-to-show sequencing, zoom synchronization, state replay, page-title
suppression, and child-window denial now have a shell-owned controller. Plot URL
validation and HTTP download failures have a separate download owner. Plot open,
external browser open, native save, filesystem write, image conversion, and
clipboard-copy IPC now register through a shell external IPC owner. The window
factory was corrected from the unintended 980 by 720 geometry to the DialogR
reference's 980 by 760 geometry and restores its hidden menu bar; the
source-identical plot page, CSS, toolbar, and assets are unchanged.

Help-window identity, load/show sequencing, title suppression, navigation
prevention, and child-window denial now have a shell-owned controller. The
window factory was corrected from the unintended 960 by 720 geometry with a
520 by 360 minimum to DialogR's 960 by 760 geometry with a 720 by 480 minimum,
hidden menu bar, and `show: false` ready-to-show lifecycle. Multiple/search
topic chooser markup and escaping now belong to the runtime help domain, while
dynamic-help URL rewriting, localhost-only validation, redirect-aware fetch,
and normalized page responses live beside the R help server. The source-
identical help page remains unchanged. Native help-server startup now uses the
same installed-binary discovery policy as the main R runtime instead of relying
on a terminal-provided `Rscript` PATH entry. Browser-hosted help routes both
localhost and same-origin R help URLs through the WebR help-page bridge, so
deployed web origins do not fall through to a static-server 404.
Local production verification now treats source-level checks as a separate
fast layer instead of evidence about the shipped application. Product-owned
`verify:production` commands build and launch the unpacked Electron
application, assert its `app.asar` and unpacked R sources, and exercise both
console execution and `?print` help. The web production runner builds the
product distribution, serves that compiled output on a secure non-localhost
test origin, requires cross-origin isolation, enters `?print` through the
rendered console, and fails on browser, request, or HTTP errors. These commands
are intended for local pre-push verification and do not alter product GitHub
Actions workflows.

Package restart confirmation and install-library choice prompts now live beside
the R package install/update workflow. Prompt and restart IPC registration also
lives in that dependency layer, while Electron composition supplies the
unchanged workspace save/restart/restore callback. The DialogR action model is
preserved: restart prompts return clean, restore, or cancel; library prompts
return user, default, or cancel. DialogForge keeps its existing informational
detail that lists affected packages and concrete library paths.

Workspace quit prompting now has a shell lifecycle dialog owner. The visible
quit prompt is restored to DialogR's localized title/message/detail text,
`Closing R session` and `Save workspace image?`, with Save, Don't Save, and
Cancel actions. The save target remains `~/.RData`, the save still runs through
the runtime workspace-file method, and save failures now use the existing
localized Workspace Save Failed dialog text while preserving the runtime error
detail.
Unexpected R exit recovery now has a shell lifecycle dialog owner as well. This
modal Restart/Close recovery prompt is a DialogForge extension around the
rewritten runtime-session manager; DialogR records unexpected terminal exit in
the renderer session state instead of showing this main-process modal. The
existing Forge behavior is preserved and documented explicitly rather than
being implied as DialogR parity.

Settings-window identity, reuse/focus, saved-position fixed-size creation,
load-before-show sequencing, initialization payload delivery, and save
notification now have a settings-owned Electron controller. About-window
identity, readiness-aware queued rendering, reuse/focus, and product payload
presentation now have a shell-owned controller. Both retain the source-
identical DialogR pages and reference geometry. About menu removal is restored
to the DialogR Windows-only rule, and the previous unrecorded Forge-only
external-link interception has been removed so the reference window behavior
is preserved. Settings read/write/open, settings-save publication, about open,
runtime-requirements open/save, menu-customization open/save, and menu dialog
JSON import IPC now register through an application settings/admin owner.

Dialog runtime-requirements window identity, reuse/focus, saved-position
fixed-size creation, load-before-show sequencing, payload delivery, and save
notification now have a dialog-runtime owner. Menu-customization identity,
reuse/focus, saved-position fixed-size creation, ready-to-show sequencing,
show-time tree payload delivery, saved notification, and imported-dialog
notification now have a menu-shell owner. The active source-identical pages and
their CSS remain unchanged except for DialogForge module-loader paths. Forge's
current menu page performs rename and top-level editing inline; the legacy
source-identical rename/top-edit pages remain packaged as compatibility assets
and are not represented as active child windows.

The dialog runtime now delegates command-template handling, command preview/
run/copy/script-editor emission, `iSpeak`/`iSpeakButton` event dispatch,
build/reset/canvas/element-build/CustomJS sequencing, control lifecycle,
condition parsing/checking, container search, control-builder registry/type
dispatch, incoming R data ingestion, state-change application, pending
restore application, restore start/retry orchestration, restore
finalization/replay, state snapshot/save serialization, and every control
builder to explicit typed modules. Button,
checkbox, input, counter, plot, separator, slider, select, radio, label,
container, sortable choice, and logical group behavior retain the reference DOM
classes, styling inputs, event order, and restore semantics. `dialogRuntime.ts`
is now the protocol, state-restore, and composition coordinator rather than a
control-rendering, build, or event-dispatch monolith.

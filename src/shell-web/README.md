# Web Shell

This directory contains the browser host for the DialogForge application.
WebR is an R transport used by this host; it is not an application or product
variant. Electron and the browser must run the same APP behavior.

## Application / host invariant

If behavior can be described without naming a native platform API, browser API,
local R process, or WebR worker, it belongs in a shared feature owner such as
`src/base-app`, `src/runtime`, `src/dialog-runtime`, `src/dataset-editor`, or
`src/script-editor`.

The browser host may adapt shared behavior to browser mechanisms. It may not
omit that behavior, replace it with browser policy, or silently return a
placeholder result. In particular, dialog state, command construction,
close/save rules, dataset-change projection, renderer events, settings
semantics, transcript event shapes, menu semantics, and product behavior are
APP concerns.

The legitimate host boundaries are narrow:

- resource loading through `src/core/contracts/hostAdapter`;
- native filesystem/dialogs versus browser handles, uploads, and downloads;
- Electron windows/IPC versus browser overlays, routes, and `postMessage`;
- native versus browser clipboard and external-link mechanisms;
- local R transport versus WebR worker and browser stream transport;
- native settings/files versus browser storage.

Both transports must convert runtime output into the shared APP transcript
event contract. There is no separate "WebR output" policy.

## Shared semantic owners

- Product dialog command preview, state restoration, and close cleanup use
  `ProductDialogSessionController` in both hosts.
- Data Editor settings and runtime dataset-change projection use the shared
  `createDatasetEditorSettings` and `createRuntimeDatasetChangeProjector`.
- Dialog variable containers read the prepared workspace snapshot. The shared
  Data Editor cache paints from a small first batch, completes rich variable
  metadata in background pages, and refreshes only named metadata deltas.
- Script Editor save and live-session close handshakes use the shared
  `createScriptEditorCloseSaveCoordinator`.
- Shared renderer pages define their bridge interfaces; Electron and browser
  preloads must satisfy the same interfaces at compile time.
- Shared renderer routes use shared IPC/event channel constants, never private
  browser or Electron names.

`npm run build:web` checks this boundary mechanically. It fails when a browser
page references a module that was not emitted, when a statically named shared
renderer route is absent from the browser dispatcher, or when browser page
JavaScript cannot be parsed. Unsupported browser invokes and sends throw an
explicit error instead of returning `null` or doing nothing.

Rendered Electron and browser workflows remain required for visible behavior;
a sentinel or parity point total is not parity certification.

`browserComposition.ts` is the first browser-host entrypoint. It composes the
selected product through the normal application contract with `hostKind: "web"`
and installs a browser host adapter. Dialog surfaces, auxiliary work surfaces,
and durable browser storage are host mappings around shared APP owners.

`browserFileAdapter.ts` and `browserStorageAdapter.ts` define the current
browser-safe file and storage boundary. Uploaded files are represented by
browser file references, save operations are represented as downloads, settings
and workspace state are stored through a web `Storage` object, and native
filesystem paths are not assumed.

`browserDialogSurface.ts` maps product dialogs to browser-hosted modal surfaces.
It preserves the existing dialog renderer by loading `dialogBuilder.html` in an
overlay frame rather than rebuilding dialog controls or product dialog styling.

Auxiliary surface taxonomy is shared from
`src/base-app/features/auxiliary-surfaces/auxiliarySurfaces.ts`. Settings and
About are modal surfaces; Help and Plot Viewer are panels; Script Editor and
Data Editor are routes because they are work surfaces rather than short dialogs.

`pages/shell.html` is the current browser-runnable product shell. It is served
by `scripts/web-product-dev-server.js`, receives product/runtime/dialog metadata
from the normal browser composition contract, loads WebR from the maintained
`webr` package assets when the selected product/runtime uses WebR, and opens
product dialogs as modal frames.

`dialogBuilder.html` uses the shared dialog runtime in browser ESM mode.
When it is loaded without Electron/Node integration, it installs
`browserPreloadBridge.js` and loads
`src/dialog-runtime/renderer/modules/dialogBuilderInterface.js`. The parent
web host fetches normalized dialog JSON, posts `dialogCreated` and
workspace events into the frame, and routes runtime commands and product
external calls through the shared preload bridge. Parent-side dispatch for
those iframe messages lives in `browserPreloadChannelBridge.ts` as browser
transport around shared channel adapters, not as a separate product or runtime
implementation.

`pages/shell.js` remains a browser-specific composition root. That is not an
application-policy owner: new semantic work must begin in shared code and reach
both hosts through narrow bindings. A browser-only semantic branch is a contract
violation even when a browser-only test passes.

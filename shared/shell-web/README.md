# Web Shell

This directory is reserved for the browser host for DialogForge.

The web shell should compose the same shared base app, product contribution, and
runtime-provider contracts used by the Electron shell. It should not fork
DialogR or DialogQCA product code into a separate web application.

The first boundary is host capability ownership:

- resource loading through `shared/core/contracts/hostAdapter`;
- file access through browser-safe handles, uploads, downloads, or remote
  workspace storage;
- clipboard and external-link actions through a web host adapter;
- dialogs and auxiliary surfaces as browser overlays, panels, or routes;
- runtime execution through provider-neutral session and transport contracts.

The Electron shell remains the production host today. This folder exists so web
work has a clear owner instead of leaking browser-specific branches into shared
feature code or product repositories.

`browserComposition.ts` is the first browser-host entrypoint. It composes the
selected product through the normal application contract with `hostKind: "web"`
and installs a browser host adapter. Dialog surfaces, auxiliary windows, and
durable browser storage are still separate follow-up mappings.

`browserFileAdapter.ts` and `browserStorageAdapter.ts` define the current
browser-safe file and storage boundary. Uploaded files are represented by
browser file references, save operations are represented as downloads, settings
and workspace state are stored through a web `Storage` object, and native
filesystem paths are not assumed.

`browserDialogSurface.ts` maps product dialogs to browser-hosted modal surfaces.
It preserves the existing dialog renderer by loading `dialogBuilder.html` in an
overlay frame rather than rebuilding dialog controls or product dialog styling.

`browserAuxiliarySurfaces.ts` maps Electron auxiliary windows to browser
surfaces. Settings and About are modal surfaces; Help and Plot Viewer are panels;
Script Editor and Data Editor are routes because they are work surfaces rather
than short dialogs.

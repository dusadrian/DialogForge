# Browser dialog preparation

The browser host prepares registered shared and product dialogs after WebR
startup, yielding between hidden renderers so the console and menus become
usable first. Opening a dialog before its background preparation finishes
awaits that same preparation. Each dialog retains its iframe after closing;
its controls are prepared again while hidden. Package compatibility checks
and attachment happen when the dialog is opened, never during hidden preparation.

Opening reveals the existing surface and activates the shared renderer's
CustomJS bindings with the current workspace snapshot and saved dialog state.
Hidden preparation does not run CustomJS, consume opening context (for example
Go to case), scan datasets, or publish command previews. Only missing workspace
metadata uses the opening progress cover. Missing or incompatible packages keep
the existing error and update workflow.

This is the user-requested browser lifecycle change from constructing a dialog
on each click. The Electron path still builds and activates together. Browser
window markup, dialog controls, styles, geometry, close behavior, and saved
control values retain their existing contracts. Keeping the prepared documents
uses more browser memory in exchange for removing document loading on open.

## Browser startup acceleration

Runtime assets use a durable cache keyed by their own asset stamp, independently
of shell/dialog bundles. Activation migrates matching assets from the previous
combined cache. First-visit startup briefly awaits service-worker control, with
a bounded fallback when registration is unavailable.

The package-library image downloads and decompresses concurrently with WebR
initialization, retaining the existing persistent filesystem and image caches.
Shared R source files download concurrently and evaluate in their original
dependency order. Browser startup skips package-only availability tasks because
their namespace probes load packages and may trigger WebR downloads. Dialogs
and explicit package actions retain their existing checks when requested. Startup
commands and workspace tasks still run before readiness. Native startup is unchanged.
WebAssembly shared libraries (.so) receive the same negotiated compression as
the main runtime binary.

This deliberately changes the browser readiness boundary: hidden dialog
preparation no longer blocks initial use. DOM, CSS, retained surfaces, saved
values, and opening-time package loading remain the existing shared contracts.
The serial package library now supports release-manifest-selected startup and
deferred images. Startup contains jsonlite, digest, and base64enc; the remaining
packages, with documentation retained, mount at a separate library path before
the first dialog package check, console execution, Import, dataset operation,
or help request. Mounting is serialized with runtime operations and does not
attach packages. Dialog opening retains the existing compatibility checks and
visible library commands. Hidden dialog preparation and workspace polling do
not fetch the deferred image. Both images use their own content hash and persist
independently across browser restarts and application rebuilds. Legacy products
without a split manifest continue using the complete library image.

The architecture overview and product parity documents live under `internal/`
in this checkout rather than the `docs/` paths named by AGENTS.md. They and the
current browser surface, shared renderer, Electron dialog controller, and
product dialog sources were used as the behavior references.

### Split-library help acceptance

Rendered split-library checks exposed an existing R help lookup issue: passing
the local `package` symbol to `utils::help()` resolved the literal package name
instead of its value. The shared R helper now passes evaluated arguments through
`do.call()`. The existing help viewer DOM, CSS, navigation and rendering remain
unchanged. This is an unplanned compatibility fix discovered during the
startup/deferred package-library acceptance checks.

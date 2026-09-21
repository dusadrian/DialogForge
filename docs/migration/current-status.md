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
The package library is still a single archive; splitting it into independently
downloadable packages remains future work and is not claimed by this change.

The architecture overview and product parity documents named by AGENTS.md were
absent in this checkout when this change was made. The current browser surface,
shared renderer, Electron dialog controller, and product dialog sources were
used as the behavior references.

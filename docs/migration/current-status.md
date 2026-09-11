# Browser dialog preparation

The browser host prepares registered shared and product dialogs during WebR
startup. Definitions, renderer documents, controls, fonts, and package checks
finish before startup reports ready. Each dialog retains its iframe after
closing; its controls are prepared again while hidden.

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

The architecture overview and product parity documents named by AGENTS.md were
absent in this checkout when this change was made. The current browser surface,
shared renderer, Electron dialog controller, and product dialog sources were
used as the behavior references.

# Architecture Overview

DialogForge is organized around a runnable shared base app, external product
contributions, and runtime providers.

## Shared Base App

`shared/base-app` must run without DialogQCA or DialogR. It owns common application behavior:

- shell composition;
- default windows and pages;
- common menus;
- shared dialogs;
- shared translations;
- settings;
- help entry points;
- shared assets.

## Products

A selected product repository adds product-specific behavior:

- product metadata;
- product dialogs;
- product menus;
- product translations;
- product capabilities;
- product startup behavior;
- product assets and settings.

Products extend the base app. They do not patch private shared internals.
DialogForge should receive a product by path, such as
`<DialogR repository>`, rather than owning product source
inside its own tree.

A product repository is not an independently built application. A contributor
keeps the product source in its own repository and passes that repository's
directory path to DialogForge.

The product repository may expose `npm run check` for contributor validation.
When that product is selected, DialogForge owns its compilation, application
packaging, and artifact creation. Product identity and artifact metadata come
from the selected repository's `product.json`.

## Runtime Providers

The base app talks to a language-neutral runtime provider contract. R is one provider. Python can be another.

The base app must not check for a language name to decide behavior. It should inspect runtime capabilities and enable, disable, hide, or replace features based on what the selected provider supports.

If runtime providers are nested under the runtime tree, keep the provider
implementations in lowercase subdirectories such as:

- `shared/runtime/providers/r`
- `shared/runtime/providers/python`
- `shared/runtime/providers/julia`

That keeps the neutral runtime core and provider-specific code in one family
without blending the layers together.

## Host Adapters

DialogForge must also treat Electron and browser/platform differences as an
explicit host boundary.

Shared renderer code must work in a normal browser host without Electron.
Electron-specific code belongs in host or main-process layers, not in shared
renderer helpers.

Shared application code must not call Electron APIs directly, and it must not
depend on version-specific host behavior. Instead, it should depend on host
capabilities exposed through a host adapter. The adapter owns the
environment-specific fallback logic.

Examples:

- resource loading: modern Electron may delegate to `fetch()`, while Electron
  22 may use a Node-compatible HTTP implementation, and a webpage host may use
  the browser's native `fetch()`;
- dropped-file paths: modern Electron may use `webUtils.getPathForFile()`,
  while older Electron versions may fall back to legacy `File.path`, and a
  webpage host may expose only the browser-safe representation it supports;
- clipboard, dialogs, external links, and file pickers should follow the same
  pattern.

The rule is simple: shared feature code asks for a capability, and the host
adapter decides how that capability is implemented in the current environment.
That boundary is what keeps future Electron upgrades cheap: the version-specific
fallbacks should stay in the host adapter, not in shared renderer or product
logic.

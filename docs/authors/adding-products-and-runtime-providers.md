# Adding Products And Runtime Providers

Use this guide before adding a new product or a new runtime provider.

This document is intentionally detailed. The point is not to memorize the directory tree. The point is to show where the ownership boundaries are, which files must be connected, and which files must stay separate.

## First Read

Start by reading:

- [`docs/architecture/overview.md`](../architecture/overview.md)
- [`docs/contracts/runtime-provider.md`](../contracts/runtime-provider.md)
- [`docs/authors/where-does-this-code-go.md`](where-does-this-code-go.md)

These files tell you the ownership rules. This guide tells you how to apply them.

## Core Rule

Do not invent a new architecture just because you are adding something new.

The shared base app stays shared.
The product stays product-specific.
The runtime provider stays runtime-specific.

If a file does not clearly belong to one of those homes, stop and decide the owner before writing code.

## Part 1: Adding A Runtime Provider

### What A Runtime Provider Is

A runtime provider is the code that knows how to run one execution environment.

In this repo, that means the provider owns:
- the language-specific process or session lifecycle;
- the capability manifest;
- the data shape for that runtime;
- runtime-specific read, write, and query behavior;

However, the provider does not own product menus or product dialogs.

The base app must not branch on a language name. It must ask for capabilities and react to what the provider says it can do.

## Part 2: Dialog Directories

### Dialogs As Directories

DialogCreator separates the dialog definition from the custom code, shipping into a `.dc.zip` file.

The dialog definition should be declarative.
The custom code should live in a separate file.
The unzipped dialog form should be an editable directory.

### Canonical Dialog Files

Each dialog directory should contain at least:

- `dialog.json` for the dialog definition;
- `actions.js` for the custom dialog code.

### Provider Buckets

Dialogs should be arranged by runtime provider.

The target shape is:

```text
dialogs/
    R/
        <dialog-id>/
            dialog.json
            actions.js
    Python/
        <dialog-id>/
            dialog.json
            actions.js
```

Use the runtime provider bucket that matches the dialog behavior.

If a dialog is truly provider-neutral, keep it in a neutral home only if it really stays neutral. Do not force every dialog into a fake shared bucket just for symmetry.

### What Lives In The Dialog Directory

The dialog directory should hold only dialog-local files.

Typical files are:

- `dialog.json`;
- `actions.js`;
- dialog-local helper modules;
- dialog-local assets;
- dialog-local fixtures when they are part of the dialog package.

What should not be inside the dialog directory:

- unrelated product code;
- shared runtime internals;
- shell-specific Electron code;
- global registries;
- helper files that do not belong to that dialog.

### What The Dialog Definition Owns

`dialog.json` should own the declarative dialog structure:

- dialog id;
- label;
- runtime provider;
- controls;
- layout;
- validation metadata;
- command metadata;
- preview metadata;
- provider-specific dialog settings that are declarative, not procedural.

### What `actions.js` Owns

`actions.js` should own the dialog behavior that used to live inline in the dialog file.

That includes:

- event handlers;
- custom command assembly;
- preview updates;
- runtime-specific branching that the dialog needs;
- helper functions that are only meaningful for that dialog.

### How `.dc.zip` Fits In

`.dc.zip` should be the portable package form.

The archive should round-trip to the dialog directory without losing the split between:

- `dialog.json`;
- `actions.js`;
- any dialog-local support files.

When unpacked, the archive should produce the editable dialog directory.

For the full source-owned dialog authoring workflow, including development
import behavior, registry entries, menu entries, capabilities, translations, and
product validation, see [Adding Dialogs](adding-dialogs.md).

### How The Repo Should Reference Dialogs

Any registry or manifest that points at a dialog should point at the dialog directory.

That means the target home should describe a directory such as:

- `<product-repository>/dialogs/<provider>/<dialog-id>/`

or, for shared dialogs:

- `shared/base-app/dialogs/<provider>/<dialog-id>/`

The registry entry can still name the individual files inside that directory, but the owner is the directory.

### Helper Ownership Levels

Dialog support code should use the narrowest shared home that still matches its reuse scope.

- `shared/` means usable by all products and all providers;
- `shared/dialog-externals/` means usable by all products and all providers, but only for dialog external-call plumbing;
- `shared/runtime/providers/<provider>/dialog-externals/` means usable by all products, but only for one provider;
- `<product-repository>/dialog-externals/<provider>/` means usable by one product and one provider bucket;
- `<product-repository>/dialogs/<provider>/<dialog-id>/` means local to one dialog package.

Do not place a helper in a broader shared directory than its reuse scope requires.

### How To Decide The Provider Bucket

If the dialog command syntax or behavior depends on the runtime provider, put the dialog under that provider bucket.

Examples:

- R-specific dialog behavior goes under `dialogs/R/`;
- Python-specific dialog behavior goes under `dialogs/Python/`;
- provider-neutral dialog behavior stays outside provider buckets only if it is truly provider-neutral.

### Where A Runtime Provider Lives

Create the provider under:

- [`shared/runtime/providers/`](../../shared/runtime/providers)

Use a lowercase provider directory:

- [`shared/runtime/providers/r`](../../shared/runtime/providers/r)
- [`shared/runtime/providers/python`](../../shared/runtime/providers/python)

Keep provider-specific files inside that provider directory.

### What A New Provider Usually Needs

A new provider usually needs these pieces:

- a provider factory under `shared/runtime/providers/<provider>/runtimeProvider.ts`;
- a provider manifest;
- a session implementation;
- controllers for commands, queries, workspace, tabular data, help, completions, dependencies, or prompts as needed;
- any source files for the runtime bootstrap or worker process;
- a short `README.md` in the provider directory that explains what the provider does.

The provider does not need every controller from day one. It only needs the capabilities it actually supports.

### The Shared Contracts It Must Plug Into

The runtime provider must satisfy the shared provider contract in:

- [`shared/runtime/provider-contract/runtimeProvider.ts`](../../shared/runtime/provider-contract/runtimeProvider.ts)

The provider must also be registered in:

- [`shared/runtime/providers/runtimeProviderRegistry.ts`](../../shared/runtime/providers/runtimeProviderRegistry.ts)

That registry is how the base app finds the provider.

### Minimum Registration Steps

When adding a new provider:

1. Create the provider directory under `shared/runtime/providers/<provider>/`.
2. Add `runtimeProvider.ts`.
3. Export a `createRuntimeProvider(...)` factory.
4. Define the manifest with the provider id, label, language, status, and capabilities.
5. Register the factory in `shared/runtime/providers/runtimeProviderRegistry.ts`.
6. Add or update provider README files if the provider has special setup rules.
7. Add or update tests for the provider contract and capability behavior.

### What The Provider Owns

The provider owns code that depends on the execution system.

Typical examples:

- starting and stopping the runtime session;
- talking to the runtime process or service;
- running visible commands;
- handling invisible queries and mutations;
- listing workspace objects;
- reading and writing tabular data;
- producing help topics or completions;
- checking dependencies.

### What The Provider Must Not Own

The provider must not own:

- product menus;
- product dialogs;
- product startup decisions;
- product translations;
- shell window creation;
- Electron-only UI behavior;
- shared app composition code.

### How To Decide Whether Something Belongs In The Provider

Ask one question:

- does this code need to know how the runtime works?

If yes, it belongs in the provider or in a shared runtime contract that the provider implements.

If no, it probably belongs somewhere else.

### Suggested Provider File Map

This is the shape to aim for.

```text
shared/runtime/providers/<provider>/
    README.md
    runtimeProvider.ts
    session/
    commands/
    queries/
    workspace/
    tabular/
    help/
    dependencies/
    prompts/
    runtime sources or scripts
```

Do not create empty directorys just because the pattern looks neat. Create only the parts the provider actually needs.

### How The Base App Sees The Provider

The base app should see:

- a manifest;
- a session snapshot;
- a capability list;
- request/response contracts;
- a stable provider id.

The base app should not see provider internals.

### What To Update When The Provider Changes

When you add a capability:

- update the provider manifest;
- update the shared contract if needed;
- update feature gating in the base app;
- update any product code that depends on that capability;
- update the provider tests.

When you remove a capability:

- remove it from the manifest;
- remove or disable the code paths that rely on it;
- update the docs;
- make the failure mode explicit.

## Part 3: Adding A Product

### What A Product Is

A product is the branded, user-facing package that sits on top of the shared base app.

The product owns:

- product metadata;
- product dialogs;
- product menus;
- product translations;
- product startup behavior;
- product capabilities;
- product settings;
- product assets;
- product-specific runtime adapters when needed.

The product does not own shared runtime contracts or shell behavior.

Concrete example of a product repository structure:
`https://github.com/RODA/DialogR`

### Where A Product Lives

Products live outside the DialogForge base repository.

DialogForge loads a product with `--product-path <path>`, as long as the external
product repository contains a valid `product.json` and contribution source.
DialogForge has no in-checkout product location and no implicit product lookup.

### What A New Product Usually Needs

A new product usually needs these pieces:

- `product.json`;
- `capabilities/product-capabilities.json`;
- `menu/menu.json`;
- `settings/settings.json`;
- `startup/startup-tasks.json`;
- `about/about.json`;
- `i18n/<locale>.json`;
- `dialogs/` for product dialogs and product dialog helpers;
- `bootstrap/productContribution.ts`;
- any product-specific runtime adapters under `runtime-r/`, `runtime-python/`, or another runtime-specific subdirectory if needed;
- any product-specific assets.

### The Product Location Link

Products are not linked through a static product registry.

The base app resolves a product location from either:

- `base`, when no product path is supplied; or
- an explicit filesystem path passed with `--product-path`.

That resolution produces a `ResolvedProductLocation` from:

- [`shared/core/contracts/productLocation.ts`](../../shared/core/contracts/productLocation.ts)
- [`shared/base-app/bootstrap/productResolver.ts`](../../shared/base-app/bootstrap/productResolver.ts)

The resolver fails fast when the selected product is invalid. A missing
`product.json`, missing contribution, or invalid contribution export should be
treated as a product packaging error, not as a silent fallback to the base app.

The product contribution source usually lives in:

- `<product>/bootstrap/productContribution.ts`

For an external TypeScript product, DialogForge compiles the contribution when
a product path is selected. If an external product ships plain JavaScript
directly in the product root, the same relative path may exist under
`<product>/bootstrap/productContribution.js`.

### What The Product Contribution Does

The product contribution connects product-owned code to the shared app.

It usually supplies:

- product id;
- DialogForge product-contribution contract version;
- product-specific external call hosts;
- product-specific capability wiring;
- product-level adapters for dialogs or other product-specific hooks.

Keep it small. It should be a registration point, not a dumping ground.

The compiled contribution must be a CommonJS module that exports one of:

- `productContribution`;
- `default`, containing the contribution object.

The contribution object must satisfy DialogForge's product-facing core SDK. The
SDK is for people who edit product wiring, not for people who only add ordinary
dialogs. Most dialog authors can stay in `dialog.json`, `actions.js`,
`dialogs/dialogs.json`, `menu/menu.json`, capability files, and locale files.

Use the SDK when you edit:

- `bootstrap/productContribution.ts`;
- product-level external call hosts;
- product-level console state chips;
- product-level runtime method calls.

The SDK is staged inside DialogForge:

- staged package: `dist/sdk/core`;
- package name: `@dialogforge/core`.

Build or refresh it from the DialogForge repository with:

```sh
npm run sdk:core
```

During local development, the product repository points a dev dependency at
that staged package. If DialogForge and the product repository are siblings,
the product `package.json` usually contains:

```json
{
    "devDependencies": {
        "@dialogforge/core": "file:../DialogForge/dist/sdk/core"
    }
}
```

After changing `package.json`, run this from the product repository:

```sh
npm install
```

Then import the public product contract from `@dialogforge/core`:

```ts
import {
    PRODUCT_CONTRIBUTION_CONTRACT_VERSION,
    type ProductContribution
} from "@dialogforge/core";

export const productContribution: ProductContribution = {
    id: "MyProduct",
    dialogForgeProductContract: PRODUCT_CONTRIBUTION_CONTRACT_VERSION,
    createDialogExternalCallHosts: function() {
        return {};
    }
};
```

The package contains the runtime value for
`PRODUCT_CONTRIBUTION_CONTRACT_VERSION` plus the TypeScript types for product
contributions, external dialog calls, console state chips, and runtime extension
method calls. Use that SDK surface instead of importing from DialogForge's
`shared/` tree.

Set `dialogForgeProductContract` to the current
`PRODUCT_CONTRIBUTION_CONTRACT_VERSION` exported by `@dialogforge/core`.
DialogForge validates the staged contribution before loading or packaging a
product. It fails with a product contribution validation error when:

- the contribution does not export an object as `productContribution` or
  `default`;
- `id` is missing or does not match the selected product's `product.json`;
- `dialogForgeProductContract` is present but unsupported;
- `createDialogExternalCallHosts` is missing;
- optional console-state chip fields have the wrong shape.

For a human contributor, the usual setup sequence is:

1. Clone or update DialogForge.
2. In DialogForge, run `npm install` if dependencies are not installed.
3. In DialogForge, run `npm run sdk:core`.
4. In the product repository, make sure `@dialogforge/core` points to
   `file:../DialogForge/dist/sdk/core` or the equivalent relative path for your
   checkout layout.
5. In the product repository, run `npm install`.
6. Edit `bootstrap/productContribution.ts`.
7. Run the product's check command, usually `npm run check`.
8. From DialogForge, run `npm run dev:product -- /path/to/MyProduct` to see the
   product in the app.

For an agent, keep the same boundary: product code may import
`@dialogforge/core`, but should not import DialogForge private `shared/` files
for product contribution types.

### Suggested Product File Map

This is the shape to aim for.

```text
MyProduct/
    product.json
    about/about.json
    capabilities/product-capabilities.json
    menu/menu.json
    settings/settings.json
    startup/startup-tasks.json
    i18n/
    dialogs/
        R/
            <dialog-id>/
                dialog.json
                actions.js
        Python/
            <dialog-id>/
                dialog.json
                actions.js
    bootstrap/productContribution.ts
    runtime-r/
    runtime-python/
    assets/
```

Again, do not create unused directorys just for symmetry. Create what the product actually needs.

A product may alternatively provide plain CommonJS JavaScript at the expected
relative entry point.

### What The Product Owns

The product owns code that is branded or behavior-specific.

Typical examples:

- product text;
- product menus;
- product startup tasks;
- product dialogs;
- product-specific command wiring;
- product-specific runtime adapters;
- product-specific settings;
- product-specific assets.

### What The Product Must Not Own

The product must not own:

- the shared base app;
- runtime provider contracts;
- shell-only Electron behavior;
- global IPC policy;
- shared runtime session code;
- shared dialogs that should stay reusable.

### How To Decide Whether Something Belongs In The Product

Ask one question:

- would this code still make sense if the same app were branded differently?

If no, it probably belongs in the product.

If yes, it probably belongs in shared code.

### Product Files And Their Roles

#### `product.json`

This is the product identity file.

Use it for:

- product name;
- product id;
- version-related metadata;
- the product's default runtime provider;
- the set of runtime providers the product supports and can import dialogs for;
- any other product identity that the app needs at startup.

#### `about/about.json`

This is the product about payload.

Use it for:

- about-window text;
- version display;
- license display;
- product description.

#### `capabilities/product-capabilities.json`

This file describes product-level feature toggles and defaults.

Use it for:

- product-specific capabilities;
- feature visibility decisions;
- product startup policy;
- any behavior that should vary by product without touching shared code.

#### `menu/menu.json`

This file defines the product menu structure.

Use it for:

- menu labels;
- menu ordering;
- accelerators;
- product-specific menu entries.

#### `settings/settings.json`

This file defines product settings.

Use it for:

- product preferences;
- persisted startup choices, including the last selected runtime provider;
- defaults that should survive app restarts;
- settings page content;
- settings that need to be loaded by the shared app.

### Runtime Provider Defaults And Persistence

Treat runtime provider selection as two separate concepts:

- `product.json.runtimeProviders` lists the providers the product supports and can import dialogs for;
- `product.json.defaultRuntimeProvider` names the provider the product should open with by default;
- `settings/settings.json` should persist the user's last selected provider, usually through `runtimeStartup.providerId`.

Do not treat the order inside `runtimeProviders` as the product default unless you have no explicit `defaultRuntimeProvider`.

Use `defaultRuntimeProvider` first on first launch or when the persisted value is missing or invalid.
If that field is missing, fall back to the first entry in `runtimeProviders`.
Use the persisted startup provider on reopen so the app comes back in the same runtime the user last selected.

If the user changes the provider during the session, update the persisted startup provider immediately instead of waiting for shutdown.

For DialogR web work, keep the provider ids explicit:

- `r` means local desktop R launched by the Electron host;
- `server-r` means a future server-managed R session;
- `webr` means the experimental in-browser WebR provider backed by the
  maintained `webr` npm package.

Do not create a separate DialogR product just to choose between these runtime
execution modes. The product remains DialogR; the runtime provider changes.

Host policy decides which providers ordinary users see. The Electron host keeps
`server-r` and `webr` hidden from normal provider choices, and ignores persisted
web-only provider values when selecting the desktop startup provider. An
explicit runtime override can still select a supported provider for advanced
testing. A web host should prefer web-capable providers such as `server-r` or
`webr` when the product declares them.

#### `startup/startup-tasks.json`

This file defines startup work.

Use it for:

- startup checks;
- runtime-start tasks;
- first-window actions;
- product initialization steps.

#### `dialogs/`

This directory holds product dialogs and dialog helpers.

Use it for:

- dialog runtime glue;
- product-specific dialog logic;
- dialog data helpers;
- dialog-specific external call adapters;
- preview helpers when they are product-specific.

Dialog directories under this directory should be grouped by runtime provider when
the dialog behavior differs by provider.

### How Product Code Links To Shared Code

Product code should link into shared code through product location and shared
contract points, not by reaching into private shared internals.

Typical links are:

- `shared/base-app/bootstrap/productResolver.ts` for product location;
- `shared/base-app/bootstrap/productContributionRegistry.ts` for loading the compiled contribution;
- `shared/core/contracts/productContribution.ts` for the product contribution contract;
- `shared/base-app` for base app composition;
- `shared/runtime/provider-contract/runtimeProvider.ts` for runtime behavior;
- `shared/runtime/providers/runtimeProviderRegistry.ts` for provider lookup;
- `shared/shell-electron` for shell behavior;
- `shared/dialog-runtime` for dialog runtime hooks;
- `shared/runtime/session` for shared runtime session handling.

If product code needs a shared service, put the service in the shared layer first, then call it from the product.

### How Product Code Links To Its Own Files

Inside the product directory, keep the links obvious.

Examples:

- `bootstrap/productContribution.ts` should be the registration entry point;
- `dialogs/<provider>/<dialog-id>/*.ts` should import dialog helpers from the same product directory when the logic is product-specific;
- `runtime-r/*.ts` should contain only R-specific product code;
- `i18n/*.json` should hold the text for that product;
- `menu/menu.json` should be the menu source of truth for that product.

Do not bury product wiring in unrelated shared helpers.

### Running And Packaging A Product

For the base app:

```sh
npm start
npm run build
```

For a product directory:

```sh
npm start -- /path/to/MyProduct
npm run dev:product -- /path/to/MyProduct
npm run build -- /path/to/MyProduct
npm run build -- /path/to/MyProduct --platform mac
npm run build -- /path/to/MyProduct --platform win --nosign
```

`npm start` without a product path starts the shared DialogForge base app.
`npm start -- /path/to/MyProduct` builds the shared base app and starts it with
the selected product path.

`npm run dev:product -- /path/to/MyProduct` builds the shared base app once,
starts Electron with the selected product, watches the product directory, and
restages changed product files into DialogForge's `dist/products/<productId>`
area. After a successful restage, Electron is restarted automatically so
startup-owned product contribution, menu, locale, and dialog registry changes
are picked up without a manual rebuild-and-restart loop.

`npm run build` without a product path builds the shared DialogForge base app
only. `npm run build -- /path/to/MyProduct` builds the shared base app and then
packages the selected product. The product id, product name, version, icons, and
app id are read from the product's `product.json` and asset files.

DialogForge intentionally does not compile product source during its own base
build. When a product path is selected, DialogForge compiles that product
contribution before starting or packaging the selected app.

Product repositories may expose `npm run check` for local contributor and CI
validation, but they are not expected to build an application or publish their
own application artifacts.

### Building A Product In GitHub Actions

GitHub Actions exposes a separate manual workflow for every maintained product
and platform combination:

- `Build DialogR Linux`;
- `Build DialogR Windows`;
- `Build DialogR macOS`;
- `Build DialogQCA Linux`;
- `Build DialogQCA Windows`;
- `Build DialogQCA macOS`.

Two additional workflows build all three platforms in parallel:

- `Build DialogR`;
- `Build DialogQCA`.

Each workflow checks out its named product repository automatically. The
optional `product_ref` input selects a branch, tag, or commit SHA instead of the
repository's default branch. The workflow validates the product with
`npm run check`, reads its `product.json`, and asks DialogForge to package it.

For private product repositories, add a repository secret named
`PRODUCT_REPOSITORY_TOKEN`. It must have read access to the product repository.
Public repositories can use the default GitHub token. Binary workflows upload
platform files directly to the selected GitHub Release rather than retaining an
intermediate GitHub Actions artifact.

### Local macOS Notarization

After building a local Apple Silicon DMG, submit it with the product-specific
command:

```sh
npm run submit:DialogR
npm run submit:DialogQCA
```

These commands read the product name and version from the sibling product
repository's `product.json`, then select the matching
`build/output/<product>_<version>_silicon.dmg`. They use the
`developer-id-notary` Keychain profile by default. Set
`DIALOGFORGE_NOTARY_PROFILE` to use another stored profile.

Show only the newest notarization submission from the account history:

```sh
npm run history
```

After that submission is accepted, staple its ticket:

```sh
npm run staple:DialogR
npm run staple:DialogQCA
```

### Product Tests

Base DialogForge verification proves that the shared engine and contracts work
without depending on product code.

Product-specific tests are owned by the product repository. DialogForge's base
verification command is:

```sh
npm run verify:engine
npm run verify:all
```

Use `npm run verify:engine` for shared DialogForge changes. `npm run verify:all`
is currently the same base-engine check.

Products should keep their own test scripts and suite manifests in their own
repository, even if they reuse DialogForge test helpers or generic runners.

DialogForge's product-dependent Electron workflow scripts require an explicit
product path:

```sh
DIALOGFORGE_ELECTRON_PRODUCT_PATH=/path/to/MyProduct npm run measure:electron:data-editor
```

Those scripts require the product path explicitly and do not fall back to any
bundled or implicit product location.

## Part 4: If You Are Adding Both At Once

Sometimes a new product and a new runtime provider come together.

In that case:

1. Add the runtime provider first.
2. Register the provider in the runtime registry.
3. Add the product.
4. Register the product contribution.
5. Wire the product to the provider through capability checks and shared contracts.

Do not add a product that silently assumes a runtime provider exists unless the provider contract is already explicit.

## Part 5: Concrete Examples

### Example: Adding A New Runtime Provider Called `stata`

You would create something like:

```text
shared/runtime/providers/stata/
    README.md
    runtimeProvider.ts
    session/
    commands/
    tabular/
```

Then you would:

- register the factory in `shared/runtime/providers/runtimeProviderRegistry.ts`;
- update the shared runtime contract if Stata introduces a capability the contract does not yet describe;
- keep the base app free of `if (runtimeId === "stata")` branches;
- make product features depend on capabilities instead of the provider name.

### Example: Adding A New Product Called `ABC`

You would create something like:

```text
ABC/
    product.json
    about/about.json
    capabilities/product-capabilities.json
    menu/menu.json
    settings/settings.json
    startup/startup-tasks.json
    i18n/
    dialogs/
    bootstrap/productContribution.ts
    runtime-r/
```

Product `dialog.json` files should use DialogForge's editor schema:

```text
DialogForge/schemas/dialog.schema.json
```

For VS Code in a product repository next to DialogForge, `.vscode/settings.json`
can contain:

```json
{
    "json.schemas": [
        {
            "fileMatch": ["dialogs/**/dialog.json"],
            "url": "../DialogForge/schemas/dialog.schema.json"
        }
    ]
}
```

This is an editing aid, not a second source of truth. DialogForge also validates
registered dialog files during staging and packaging.

Then you would:

- keep `ABC` as a separate repository from DialogForge;
- export `productContribution` from `bootstrap/productContribution.ts`;
- set `dialogForgeProductContract` from `@dialogforge/core`;
- let DialogForge compile and stage the contribution when a product path is
  selected;
- keep product-specific dialogs and menus inside the product directory;
- move only reusable code into `shared/`;
- link the product to shared runtime and shell code only through the published contracts.

## Part 6: Checks Before You Call The Work Done

Before you call a new runtime provider or product complete, check these things:

- the file belongs to the right owner;
- the selected product path resolves to the intended product;
- the compiled contribution exports `productContribution` or `default`;
- the contribution id and `dialogForgeProductContract` match DialogForge's
  current contract;
- the shared contract describes the data it sends or receives;
- the code is readable in the repo's style;
- the code does not leak ownership into the wrong layer;
- the docs explain where the code lives and why.

## Final Rule

If a file is hard to place, do not force it into the nearest directory.

Figure out the owner first.
Then create the file there.
Then connect it through the public contract.

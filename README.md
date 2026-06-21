# DialogForge

DialogForge is a language-neutral workbench for dialog-driven desktop
applications.

This repository contains the runnable shared application, runtime providers,
Electron host integration, build tooling, and shared verification. Products are
separate source repositories that contribute metadata, dialogs, menus, i18n,
capabilities, startup behavior, settings, assets, and product-specific runtime
adapters.

DialogForge does not contain bundled products and does not select products by
name. A product is always selected by passing its directory path.

## Start

Start the base app:

```sh
npm start
```

Start with an external product contribution:

```sh
npm start -- /path/to/DialogR
npm start -- /path/to/DialogQCA
```

The selected product's `product.json` defines its identity, version, application
id, artifact names, and product resources. DialogForge compiles and stages the
product contribution before launching it.

## Build

Build the base app:

```sh
npm run build
```

Package a product through DialogForge:

```sh
npm run build -- /path/to/DialogR
npm run build -- /path/to/DialogR --platform mac
npm run build -- /path/to/DialogR --platform win --nosign
```

Products do not build applications independently. A product repository may
provide `npm run check` for contributor validation, while DialogForge owns
compilation, staging, packaging, and artifact creation.

## Verification

DialogForge owns shared and base-app contracts:

```sh
npm run verify:engine
```

Product-specific contracts belong to the product repository. Each product
currently exposes `npm run check` for TypeScript validation; wiring the
product-owned verifier manifest into that repository's CI is the remaining test
automation task.

## Repository Structure

```text
shared/   runnable base app, runtime contracts/providers, and host-independent features
build/    compilation, staging, Electron startup, and packaging scripts
tests/    shared contracts, neutral product fixtures, and Electron workflows
docs/     architecture, contracts, migration records, and contributor guides
```

Current product repositories are separate siblings:

```text
/Users/dusadrian/Documents/GitHub/DialogR
/Users/dusadrian/Documents/GitHub/DialogQCA
```

The governing behavior contract is
[`docs/contracts/dialog-products-parity.md`](docs/contracts/dialog-products-parity.md).
The contributor workflow is documented in
[`docs/authors/adding-products-and-runtime-providers.md`](docs/authors/adding-products-and-runtime-providers.md).

## Ownership Rule

Shared behavior belongs in DialogForge. Product-specific behavior belongs in the
product repository. Runtime-language behavior belongs in a runtime provider.
Existing behavior must have a target owner, an explicit replacement, or an
explicit deletion decision.

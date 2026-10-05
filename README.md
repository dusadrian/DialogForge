# DialogForge

DialogForge is a language-neutral workbench for dialog-driven desktop and web
applications.

This repository contains the runnable shared application, runtime providers,
Electron and browser host integrations, and build tooling. Products are
separate source repositories that contribute metadata, dialogs, menus, i18n,
capabilities, startup behavior, settings, assets, and product-specific runtime
adapters.

DialogForge does not contain bundled products and does not select products by
name. Product repositories own their own contributor-facing commands and resolve
their DialogForge dependency automatically.



## Start

Start the base app:

```sh
npm start
```

Start a product from its product repository, for instance from DialogR:

```sh
npm start
```

The selected product's `package.json` defines the canonical product version and
description, while `package.json.product` defines product identity, application
id, artifact metadata, and product resources. Product wrapper scripts locate
DialogForge and pass their own repository root to the shared engine internally.

## Web Runtime Server

Start a local web runtime server for a product:

```sh
cd ../DialogR
npm run dev:web
```

The server builds the browser runtime, stages the WebR assets, resolves the
selected product contribution, and serves the web shell at:

```text
http://127.0.0.1:5173/
```

Use the corresponding product-local command for another product contribution:

```sh
npm run dev:web
```

Useful server options:

```sh
npm run dev:web -- --port 5174
npm run dev:web -- --host 0.0.0.0
```

`--port` selects the local server port. If it is omitted, the server uses
`5173`.

The `dev:web-server` npm script already starts the server with `--replace-port`.
That means if another DialogForge web server is listening on the selected port,
it is stopped before the new server starts. You normally do not need to pass
`--replace-port` yourself unless you run `dist/scripts/web-product-dev-server.js`
directly.

Create the web build manifest without starting the server:

```sh
npm run build:web
```

Product repositories use their product-local `npm run build:web` wrapper, which
writes the web runtime into the product repository's own `dist/web` directory.

Web builds use the precompiled `dialogforgeruntime` WebR package supplied under
`vendor/r-runtime`. They validate its source/build identity and archive checksum
before staging it. Deployment does not need R, Docker, or the WebR compiler.
Native R and WebR still build from the same canonical helper source files.

Desktop builds also stage supplied, version-pinned native packages from
`vendor/r-runtime/native`. The release manifest pins the package version,
exact R platform/version, qualified acceptance report and every installed file's
SHA256. Missing or corrupt artifacts fail the build; product packaging rejects
an OS/architecture with no qualified helper. Normal builds never compile a
helper or install its latest version from a package repository. Generated local
caches cannot override these pins. Only the R versions explicitly supplied in
the manifest are supported; another installed R version is not assumed compatible.
The actual packaged files are checked before signing. Mac signing legitimately
changes library bytes: a post-signing gate verifies the library's signature and
compares its code/data with the qualified original after removing signatures
from temporary copies. Other file changes remain errors. Final signed file
checksums are recorded beside the build output without modifying the sealed app.

Maintainers build and qualify each native target on that actual OS/architecture:

```sh
npm run build:r-helper:native -- 4.6.1 /absolute/private/evidence /absolute/helper-bundle
```

That explicit operation requires R, its compiler and `declared` available to the
canonical native acceptance runner. It does not launch a product UI. The manual
`Build and qualify pinned native R helpers` workflow performs this operation
for ARM/Intel Mac, Windows x64 and Ubuntu x64/ARM64, with exact selected R
versions and pinned `declared` source. Only successful qualification produces a
binary artifact; it does not publish a release. After reviewing an artifact,
import its extracted native directory:

```sh
npm run import:r-helper:native -- /absolute/extracted/native
```

Import validates and merges target pins without overwriting an existing one.
Include the manifest, receipts and binary files together. Native ABI acceptance
does not replace installed-app, signing or Linux-distribution release checks.

Maintainers changing the helper sources, compiler scripts, or WebR SDK must
regenerate the prebuilt package on a development/build machine:

```sh
npm run build:r-helper:webr
```

That explicit command requires R and Docker, compiles the canonical sources,
and updates the versioned archive and build receipt in `vendor/r-runtime`.
Include both generated files with the source change. A stale or missing package
stops the web build; it never triggers an automatic compiler download.

The web runtime currently uses the `webr` provider. Product-specific dialogs,
menus, locales, package policy, web launch policy, and product styling still
come from the selected product repository.

The WebR package-library VFS is product-specific. DialogForge first uses the
selected product's local `library/R/library.data.gz` and
`library/R/library.js.metadata` files when they exist. If they are missing,
the product must declare `product.webRPackageLibrary.releaseRepository` and
`product.webRPackageLibrary.releaseTag` in `package.json`. DialogR owns its VFS
in `RODA/DialogR` and DialogQCA owns its VFS in `RODA/DialogQCA`; both use the
`web` release tag. Do not route product VFS assets through a shared binary
repository.

Do not pass a product path by hand for normal product builds. Product
repositories wrap the lower-level DialogForge engine command and supply their
own repository root automatically.

## Build

Build the base app:

```sh
npm run build
```

Package a product from its product repository:

```sh
npm run build
npm run build -- --sign
```

Product repositories own their contributor-facing build commands. DialogForge
remains the shared build engine that product commands call internally.
macOS product packaging is ad-hoc signed by default so app bundles remain
structurally valid without private signing credentials. Pass `--sign` only when
the caller intentionally wants electron-builder to use an available Developer ID
signing identity.
The build script detects the host OS automatically; platform-specific product
scripts are CI/workflow conveniences, not the normal local command.

Internal architecture, migration, product-authoring, and script-argument notes
live under `internal/`. Public docs can be added under `docs/` later when their
audience and stability are clear.

## Public NPM Scripts

Use `npm run <script>` for custom scripts. `npm start` is the only shorthand in
this repository; it is the same as `npm run start`.

| Command | Public arguments | What it does |
| --- | --- | --- |
| `npm run build` | none | Builds the shared desktop/Electron app into `dist/`. |
| Product `npm run build` | optional product wrapper arguments | Builds and packages that product for the current host OS. Product wrapper scripts locate DialogForge and supply the product root internally. |
| Product `npm run build -- --sign` | macOS-only `--sign` | Builds a Developer ID signed macOS product artifact when a signing identity is available. Without `--sign`, macOS product builds are ad-hoc signed. |
| Product `npm run build:web` | none | Builds the product's browser/WebR app into the product repository's own `dist/web` directory. |
| `npm run sdk:core` | none | Regenerates the core SDK consumed by product repositories. |
| `npm run check:build-ownership` | none | Checks that product build/release ownership has not drifted back into DialogForge. |
| `npm start` | none | Builds and launches the shared base app. Product repositories expose their own start/dev commands. |

Official notarization and release publication are maintainer-internal operations.
Local macOS signing is available only when the caller explicitly passes `--sign`
and has a valid signing identity.

## Product Auto-Update

Packaged Electron products can opt into update checks by declaring an
`autoUpdate` policy in `package.json.product`:

```json
{
  "product": {
    "autoUpdate": {
      "provider": "generic",
      "releaseRepository": "owner/release-repository",
      "releaseTag": "ProductReleaseTag"
    }
  }
}
```

An explicit `url` can be used instead of `releaseRepository` and `releaseTag`.
When this policy exists, DialogForge passes a generic update feed to
electron-builder while packaging the product. The packaged app checks for
updates when it runs as a packaged Electron app, asks before downloading, and
shows `Restart to update` after the update is ready.

## Repository Structure

```text
src/   runnable base app, runtime contracts/providers, and host-independent features
scripts/  compilation, staging, Electron and web startup, and packaging scripts
schemas/  JSON schema contracts defining supported product dialog structures
```

Current product repositories are:
- [DialogR](https://github.com/dusadrian/DialogR)
- [DialogQCA](https://github.com/dusadrian/DialogQCA)

## Ownership Rule

Shared behavior belongs in DialogForge. Product-specific behavior belongs in the
product repository. Runtime-language behavior belongs in a runtime provider.
Existing behavior must have a target owner, an explicit replacement, or an
explicit deletion decision.

# Maintainer Release Notes

The commands in this area are maintainer release tooling, not the public
contributor build surface.

Ordinary contributors should use the documented build commands in the product
repositories and should expect unsigned local artifacts. Official signed
Windows builds and notarized macOS builds require Adrian's private release
credentials.

Each product owns its macOS notarization helper under `internal/`:

```sh
cd ../DialogR
node internal/macos-notarization.js submit
node internal/macos-notarization.js history
node internal/macos-notarization.js staple
```

Use the DialogQCA repository as the working directory for the DialogQCA release
artifact.

Personal shortcut wrappers belong under `scripts/local/`, which is ignored by
git. Do not add Adrian-only release shortcuts back to the public `package.json`
script list.

## Windows Signing

Windows signing is handled by the private DialogForge signing broker workflow:

```text
.github/workflows/sign-windows-product.yml
```

Product repositories can request that broker from their maintainer-only
`release-windows.yml` workflow. That request requires a private
`DIALOGFORGE_SIGNING_TOKEN` secret with permission to trigger workflows in
`dusadrian/DialogForge`.

The product repositories do not authenticate directly with Azure Trusted
Signing. Azure signing remains centered on the trusted `dusadrian/DialogForge`
workflow identity.

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

## Native iroh binding for Intel macOS

The iroh 1.1.0 candidate has no published Intel macOS binary. Intel builds
continue to carry a self-built `iroh.darwin-x64.node`, qualified on a genuine
Intel runner. Historically the published 0.35.0 universal binary crashed on
Intel silicon; passing under Rosetta did not establish Intel compatibility.

Candidate run `39848814830` built upstream tag `v1.1.0` and passed its Intel
probe. Its SHA256 is pinned in `scripts/nativeIrohBinding.js`. The exact binary was promoted
without rebuilding to the `iroh-bindings-1.1.0` dependency prerelease. Clean
Intel builds download that durable release asset and verify the pinned digest.
The transport matrix retains its original workflow-artifact source as evidence.

Other platforms use the published architecture packages. The browser candidate
uses DialogForgeIroh 0.2.0 with Rust core 1.0.2, matching the Node binding lock.
Desktop and browser updates must be coordinated: relay connections with the
old 0.35 transport failed qualification. Application protocol 2 alone does not
establish transport compatibility.

### Moving the pin when `@number0/iroh` changes

The binding is pinned per iroh version in `scripts/nativeIrohBinding.js`. A
dependency bump without a matching binding leaves Intel macOS running a
different iroh than every other platform, which breaks peer interoperability.
Pre-release verification fails on that mismatch, so the two must move together:

1. Bump `@number0/iroh` in `package.json` as usual.
2. Dispatch **Build native iroh binding for Intel macOS** in
   `dusadrian/DialogForge` with `iroh_version` set to the new version. It builds
   on an Intel runner, probes the result there, and refuses to publish a binding
   that crashes.
3. Copy the SHA256 from the run summary into `scripts/nativeIrohBinding.js`,
   updating both `version` and `sha256`.
4. Re-run a product macOS Intel build. The packaged smoke check is the
   regression test for this whole class of failure.

To confirm a published version on real Intel hardware without releasing
anything, dispatch **Probe native iroh on Intel macOS**; it reports PASS or FAIL
per version. If a future published version passes there, Intel can go back to
the stock binary and this pin can be retired.

To build and check an `iroh-ffi` tag without publishing it, dispatch **Build
native iroh binding for Intel macOS** with `publish_release` unset; it still
probes the result and uploads it as a workflow artifact.

## Coordinated iroh 1.1 rollout

The qualified pairing is native `@number0/iroh` 1.1.0 and browser artifact
0.2.0 (Rust iroh 1.0.2). Tickets still use format 1 and application protocol 2;
those numbers do not negotiate iroh transport compatibility. Attempts to mix
0.35 native clients with the new browser transport failed qualification. Do
not announce mixed-version support or continue an existing classroom through
this transition.

Before publishing application update metadata, retain the previous platform
installers, updater files, and complete browser deployment. Finish signing,
user-owned macOS notarization, and artifact hash checks. Windows 7/8/8.1 are
outside this Electron 43 candidate's support boundary; Electron 22 was the last
line supporting them. Passing current CI runners is not evidence for every
older operating system version.

Roll out between classroom sessions. End existing shares, make all four
platform installers available, then deploy the matching complete browser
build. Every desktop presenter and participant must install the new version;
every browser participant must reload the application. Start a new share and
issue new links/codes only after checking those versions. The invite-code
service remains unchanged because its ticket format and address schema are
unchanged. Publishing either transport by itself is not an accepted rollout.

If acceptance fails after deployment, end the affected shares and restore both
the previous desktop installers and the complete previous browser deployment.
Do not merely point the updater feed at a lower version: automatic downgrades
are disabled. Close the application and reinstall the retained previous version,
keeping the user profile and research files. The qualification records distinguish
an actual macOS Squirrel update from installer replacement/manual rollback on
other platforms. Neither check promises arbitrary future settings migrations
will be reversible.

The signing broker accepts `publish_release=false` to retain signed workflow
artifacts without changing an application release. It executes the action from
the selected checkout, uses Node 24, validates Authenticode signatures, and
refreshes the updater checksum/block map after signing. Review the final files
and acceptance receipts before publishing them.

Intel rollback qualification found that the published DialogR 1.0.26 installer
(Electron 22.3.27) fails R startup on the tested Intel Mac, both before upgrade
and after restoration. Do not use that file as the recovery target for this
migration. The retained signed pre-migration build uses Electron 43.8.3 and
iroh 0.35.0 and passed ready-R, settings, and file preservation before upgrade
and after rollback in run `39857309439`. Its exact DMG SHA256 is
`5977c99409c2cea062f5f4fadff24639d1c09eb91ddaf30e7cb2a64d9ca4965e`.
It is retained in the maintainer-only `RODA/DialogR` draft release
`iroh-1.1-rollback` so verification does not depend on expiring CI artifacts.
Notarization of this recovery artifact remains maintainer-owned too.

Run `check-signed-dialogr-installer.yml` against the retained signing run before
publication: it verifies the actual signed NSIS installation through all six
application checks and the version upgrade/rollback sequence. Signing success
or an unpacked Script Editor check alone is not that acceptance result.

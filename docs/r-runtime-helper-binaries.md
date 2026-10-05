# Pinned native R helper binaries

`dialogforgeruntime` is compiled from the same canonical helper source for
native R and WebR. The native release workflow does not create another runtime
implementation or change the existing prebuilt WebR archive.

## Building a helper pre-release

The manual **Build and upload pinned R helper binaries** workflow qualifies
macOS ARM64 and Intel, Windows x64, and Ubuntu 24.04 x64 and ARM64. Supply exact
R versions, for example `["4.6.1"]`, and an existing draft pre-release tag
starting with `r-runtime-helpers-`. Its Git tag must point to the exact source
commit selected for the workflow. Release tags must not be moved after a build.

All requested targets must pass the canonical native ABI cases, including
actual pinned `declared` measurement-level coverage, before upload. Build
failures and logs remain in workflow evidence artifacts. A passed target's
release archive retains its installed package, per-file checksums, target
manifest, and exact qualification report. The release also contains the
matching helper source, a release manifest and `SHA256SUMS`.

Uploads go to the draft pre-release only. Different bytes cannot replace an
existing asset. To rebuild after a source or toolchain change, create a new
commit-pinned release tag instead of overwriting previous pins.

The package's current component notices reserve the public-distribution
licence decision. The workflow neither changes the licence nor publishes the
draft. Public publication requires the copyright holder's explicit decision,
followed by review of the actual binary matrix. Helper ABI acceptance is not
signing, notarization or full application release acceptance.

## Using a reviewed archive

Select the exact R version and physical platform/architecture; a different
target is not a fallback. Check the downloaded archive against the release's
`SHA256SUMS` and retain the chosen release/asset digest with the build records.
Extract into an isolated directory, then run:

```sh
node scripts/native-r-helper-artifacts.js --import /absolute/extracted/r-runtime/native
```

The importer checks source/version identity, qualification and every installed
file against its receipt before adding a target to `vendor/r-runtime/native`.
It refuses to replace an existing immutable pin with a different receipt.
Ordinary product builds stage those supplied bytes; they do not download the
latest helper or compile a replacement. Linux runner qualification proves the
named distribution only, not every Linux distribution or older glibc baseline.

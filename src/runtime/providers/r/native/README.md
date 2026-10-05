# Shared R runtime helper package

`dialogforgeruntime` 0.1.0 is the single project-owned support package for
DialogForge. Native R and WebR compile the SAME C and R files in
`dialogforgeruntime/`; no separate host implementation or copied package exists.

Its source files retain distinct responsibilities: non-evaluating binding and
stored-object inspection, compiled-closure support, graphics-device observation,
scoped console input, bounded transport and ordered output capture. One native
registration table exposes all 16 existing functions through one namespace.
Application policy remains in the shared runtime sources, not in this package.

From the DialogForge repository root:

```sh
node scripts/build-r-runtime-helper.js native
node scripts/build-r-runtime-helper.js webr
```

These low-level commands compile development artifacts, not qualified release
bundles. The native library is generated under
`dist/r-runtime/native/<R-platform-and-version>/dialogforgeruntime`. WebR's
binary is generated under
`dist/r-runtime/webr/<R-version>/dialogforgeruntime_0.1.0.tgz`. Native builds use
`DIALOGFORGE_BUILD_R` (default `R`). WebR builds require R and Docker with
`ghcr.io/r-wasm/webr:v0.6.0`; `DIALOGFORGE_WEBR_BUILD_IMAGE` selects an explicit
alternative toolchain. Containers build offline from the read-only canonical
source. Generated source staging directories remain available for diagnosis.

`npm run build:web` validates and stages the supplied prebuilt WebR package
from `vendor/r-runtime`. It derives the required R version from the installed
WebR SDK and the package version from DESCRIPTION. Missing, stale or corrupt
archives or receipts fail closed; normal builds never download a compiler or
fall back to compiling the package. Maintainers explicitly run
`npm run build:r-helper:webr` to rebuild and update the supplied archive and
source/toolchain/archive-checksummed receipt. Static staging rejects incomplete
artifacts. Deploy the complete product `dist/web`, including `r-runtime`;
pushing source alone does not deploy the generated binary.

Browser startup fetches and extracts the package once into its private library.
Inspection, input and output all use that same installed package. Existing
component library settings remain aliases for the same physical native library
to preserve caller configuration; they do not select separate packages.

Desktop builds use the supplied native packages and pinned manifest under
`vendor/r-runtime/native`, not an optional ignored compilation cache. Preparation
validates the canonical package source identity, package version, recorded native
ABI acceptance, exact R platform/version and every installed file's SHA256.
Product packaging additionally requires a qualified OS/architecture match.
It never substitutes another host's binary or compiles a fallback. Unlisted
generated native libraries are moved to a recoverable `native-retired-*`
directory outside the shipped native path before the pinned payload is staged.

Both source/staged artifacts and the real packaged app are validated before
signing. The post-signing hook permits only the Mac signing transformation:
it verifies the shipped library signature, removes signatures from temporary
copies and compares all remaining bytes except the `__LINKEDIT` allocation size
retained by Apple's signature-removal tool. Any code, data, linkage or other
file change fails. It never strips the shipped library or bypasses app signing.
Final delivered file hashes are recorded beside the output in an
`r-runtime-delivery-<platform>-<arch>.json` receipt, not inside sealed app resources.
Unsupported signing transformations fail closed instead of changing release pins.

For a release target, run `npm run build:r-helper:native -- <exact-R-version>
<absolute-private-evidence-directory> <absolute-bundle-root>` on that actual host.
The canonical native ABI runner builds from the SAME package source, requires
all cases and actual `declared` coverage, and fingerprints the tested payload
before/after acceptance. Only a passed report for unchanged source and payload
can produce a bundle. Use `npm run import:r-helper:native --
<absolute-reviewed-native-directory>` to validate and merge its immutable pins.
The manual native-helper workflow builds these target bundles without publishing
them; target availability is determined by the supplied manifest, not by the
existence of the workflow. Exact R-version compatibility remains deliberate.

Compilation is not behavioral acceptance. The SAME retained inspection, prompt,
transport, output and graphics cases must pass through both host adapters.
Historical component design notes are retained beside the package. Existing
licence notices are preserved; this internal consolidation does not authorize
a new public distribution licence or publication.

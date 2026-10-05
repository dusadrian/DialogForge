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

The native library is generated under
`dist/r-runtime/native/<R-platform-and-version>/dialogforgeruntime`. WebR's
binary is generated under
`dist/r-runtime/webr/<R-version>/dialogforgeruntime_0.1.0.tgz`. Native builds use
`DIALOGFORGE_BUILD_R` (default `R`). WebR builds require R and Docker with
`ghcr.io/r-wasm/webr:v0.6.0`; `DIALOGFORGE_WEBR_BUILD_IMAGE` selects an explicit
alternative toolchain. Containers build offline from the read-only canonical
source. Generated source staging directories remain available for diagnosis.

`npm run build:web` prepares this one WebR package before staging. It derives
the required R version from the installed WebR SDK and the package version
from DESCRIPTION. Missing, stale or corrupt binaries rebuild; current binaries
reuse source/toolchain/archive-checksummed receipts. Static staging rejects
incomplete artifacts. Deploy the complete product `dist/web`, including
`r-runtime`; pushing source alone does not deploy the generated binary.

Browser startup fetches and extracts the package once into its private library.
Inspection, input and output all use that same installed package. Existing
component library settings remain aliases for the same physical native library
to preserve caller configuration; they do not select separate packages.

Compilation is not behavioral acceptance. The SAME retained inspection, prompt,
transport, output and graphics cases must pass through both host adapters.
Historical component design notes are retained beside the package. Existing
licence notices are preserved; this internal consolidation does not authorize
a new public distribution licence or publication.

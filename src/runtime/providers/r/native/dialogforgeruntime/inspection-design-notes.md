# Historical inspection-component design notes

The component versions below predate consolidation into `dialogforgeruntime`
0.1.0. They document inspection behavior, not separately buildable packages.
Current build/staging instructions are in the parent README.

`dialogforgeruntime` is a project-owned internal R package. It reads binding
state without evaluating delayed or active bindings and performs a bounded
stored-graph preflight before automatic object inspection. Native R and WebR
build from the same source. Class-method dispatch requires the separate R guard.

Build from the DialogForge repository root:

```sh
node scripts/build-r-runtime.js native
node scripts/build-r-runtime.js webr
```

The native build uses `DIALOGFORGE_BUILD_R` (default `R`) and writes a library
under `dist/r-runtime/native/<R-platform-and-version>`. The WebR build uses
the installed `ghcr.io/r-wasm/webr:v0.6.0` Docker image, without networking, and
writes a binary archive under `dist/r-runtime/webr/<R-version>`. Override the
image with `DIALOGFORGE_WEBR_BUILD_IMAGE` when intentionally targeting another
WebR toolchain. The source checkout is mounted read-only; only the generated
output directory is writable. No shared R installation or VFS repository is
modified. Source staging directories are retained with the build output.

The WebR route follows its documented [local package build process](https://docs.r-wasm.org/webr/latest/building.html).
The installed rwasm build routine may emit a dependency-discovery network error
in the offline container before compiling this dependency-free package. Treat
the final build exit status and produced archive separately from that warning.

Builds do not run the behavioral regression in `dialogforgeruntime/tests`.
Use that same regression source in native R and WebR acceptance. The R 4.6
implementation uses binding APIs; the isolated R 4.5 compatibility branch uses
the older promise accessors. Each supported host/version needs its own build
and acceptance before distribution.

Native startup selects the project-local library matching R's exact platform
and version. Browser startup fetches the archive matching its R version from
`/r-runtime/webr/<R-version>/dialogforgeruntime_0.1.0.tgz`, stages it in a
private VFS library, and loads the namespace before workspace helpers. A missing
or incompatible helper fails startup explicitly; there is no evaluating fallback.
Build the appropriate helper before launching each host. The normal web build
now prepares all three required WebR helpers before staging. It derives the R
version from the installed WebR SDK and helper versions from their canonical
DESCRIPTION files. Missing, changed or corrupt artifacts rebuild through the
existing project-owned builders; this requires R, Docker and the WebR image
above. Unchanged helpers reuse source/toolchain/archive-checksummed build
receipts, so routine web builds do not recompile them. Static staging rejects
missing or stale artifacts instead of silently producing an unusable deployment.
Deploy the complete product web output, including `r-runtime`,
`r-runtime` and `r-runtime`; pushing source files alone does
not publish these generated artifacts. Native release automation still needs to
build each supported target. Manual helper builds without a receipt are rebuilt
once by the next normal web build to establish their source identity.

Automatic snapshots, updates and copy-cache eligibility use the binding reader.
Delayed global bindings remain placeholders until explicitly evaluated or
replaced. Delayed stock S3 registrations require the expected expression,
method name, namespace, and unshadowed stock lookup function. Explicit Inspect
is unchanged. Compilation does not establish behavioral acceptance; the native
and WebR regression and rendered workflows still need to be exercised.

Version 0.2.0 adds an ALTREP preflight covering nested lists, stored attributes,
and the backing data of recognized stock representations. It allows compact
integer/real sequences and deferred strings by exact class identity, not names;
other ALTREP representations are restricted, including unrecognized stock
representations. It imposes both depth and visited-node limits. This can reduce
previews for previously accepted callback-backed data, including whole data
frames containing such columns. Other stock representations must be reviewed
before being added; do not widen the allowlist by package-name matching.

Version 0.2.1 adds stored-bytecode detection and compiled-closure rebinding for
the shared control-compilation cache. Both use the public R 4.6 closure APIs;
the isolated older-R branch retains its public accessors. Ordinary R
`environment<-` discards bytecode, so cached functions must be rebound through
this helper. Rebinding retains the source closure's attributes, does not mutate
the cache template or execute either closure, and rejects uncompiled inputs.
The cache is generated from canonical source declarations, never maintained as
a second source implementation. Its version/options/signature validation and
fallback compilation are shared R behavior, not host-adapter behavior.

Version 0.4.0 adds physical graphics-device observation. The SAME C source
records driver closure even when a low-level call bypasses `dev.off()`. A
device number, backend name or reused allocation address cannot establish old
ownership after that close. The close observer calls the original physical
driver callback exactly once; no R callback or viewer policy runs inside it.
Dropping an observation restores the original callback on its still-live
device. Shared R registration/selection consumes this token; it no longer
replaces `grDevices::dev.off` in its namespace or attached package.
Native/WebR/older-R actual acceptance remains required before distribution.

Version 0.3.0 adds shallow stored-list field discovery for completion. It reads
only stored names/class and an optional exact member, never dispatching names,
dimnames or subsetting methods or visiting field contents. Plain lists and exact
data frames are eligible; unknown classes, S4, ALTREP list/name representations,
malformed metadata and collections beyond the inspection bound are restricted.
Function-valued fields remain discoverable without executing them. The shared R
completion policy additionally applies the existing modified-known-class guard;
both hosts use this same reader and guard, not a browser-specific restriction.

The test-only `dialogforgeruntime/tests/altrepprobe.c` is a separate DLL with
counting callbacks. Do not link it into the production helper or unload it while
its ALTREP instances remain alive. `scripts/check-workspace-altrep-safety.R`
uses that fixture through DIALOGFORGE_ALTREP_PROBE_DLL; it must be compiled for
each target before running the same regression in native R and WebR.

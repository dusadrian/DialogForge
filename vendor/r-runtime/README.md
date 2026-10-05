# Prebuilt R runtime helpers

The versioned WebR archive and adjacent `.build.json` receipt are generated
artifacts intended to travel with the DialogForge source checkout. They are not
a second implementation. Native R and WebR compile the same package under
`src/runtime/providers/r/native/dialogforgeruntime`.

Normal web builds validate the canonical package, compiler scripts, installed
WebR SDK, toolchain selection and archive SHA256, then copy the package to
`dist/r-runtime`. No compiler, Docker image, network download or source-build
fallback is used to prepare the helper during deployment.

Regenerate with `npm run build:r-helper:webr` on a maintainer machine with R and
Docker. Include the archive and receipt whenever the matching source/build
identity changes. Never hand-edit a receipt to accept an old binary. The
canonical component licence notices remain inside the compiled package; this
distribution change does not relicense them.

Native binaries live under `native/<R-platform>-<exact-R-version>` and are
sealed by `native/manifest.json` plus each target's installed-file receipts.
Ordinary desktop builds validate and copy these supplied binaries; they never
compile a replacement or use an ignored cache as a fallback. Unsupported R
versions or OS/architecture targets fail rather than loading a different ABI.

Windows targets include `dialogforge-r-host.exe` alongside the helper DLL. It
adapts R's Windows startup and physical console callbacks, while console scopes,
prompt handling and recovery remain in the same helper sources as Unix/WebR.
The application selects the host for the chosen R version and signals its
process-specific interrupt event instead of terminating the R process.

Maintainers qualify targets with `.github/workflows/build-r-runtime-helpers.yml`
or `scripts/build-native-r-helper-release.js`, retain the exact acceptance
report, and import reviewed artifacts using `npm run import:r-helper:native`
with `-- <artifact-directory>`. Import does not overwrite existing pins. A new helper
version requires an explicit, recoverable retirement of the previous native
manifest and payloads before promotion. Source, binary qualification and final
signed application delivery are separate checks.

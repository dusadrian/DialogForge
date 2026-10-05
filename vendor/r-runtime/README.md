# Prebuilt WebR runtime helper

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

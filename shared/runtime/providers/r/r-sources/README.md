# R Runtime Sources

These files are the shared DialogForge R runtime-control source bundle.

Source provenance for the initial DialogForge import:

- `/Users/dusadrian/Documents/GitHub/DialogR/src/library/R`
- `/Users/dusadrian/Documents/GitHub/DialogQCA/src/library/R`

The two reference bundles were identical when imported. That import was a
preservation scaffold so DialogForge would not lose hard-won runtime behavior
while the architecture was being rebuilt.

This directory is not considered stylistically final just because the behavior
works. Rewrite work here should preserve the existing behavior through tests,
then reshape the code into DialogForge-owned R provider code following
`AGENTS.md` and the R style references listed there.

The files live under the R provider because they are language-provider
implementation details, not base-app behavior. Shared runtime files must not
emit DialogR/DialogQCA-branded diagnostics; product-specific branding belongs
in the selected product repository.

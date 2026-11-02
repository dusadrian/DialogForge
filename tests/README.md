# Console command regression checks

Run `npm run test:console` from the DialogForge checkout. It builds the app,
runs focused controller and R evaluation cases, compares the rendered native R
and WebR consoles against fixed expected transcripts, and verifies that restoring
the former implementations makes the rendered checks fail. R 4.6.1, the pinned
native helper, the R package `later`, and Playwright Chromium are required;
Linux also needs Xvfb.

The rendered cases paste through Monaco and press Enter. They check every
command prompt and output row in order, including the original `rivers` example,
real continuation lines, semicolons, invisible results, history recall, errors,
Stop/recovery, and selected code executed with the Script Editor Run button.
Native R and WebR execute the same cases and assertions. The runner starts
Electron in a fresh working directory so its preload cannot accidentally load
the checkout's `dist` when testing a copied or packaged application. Tests do not infer
success from a final output marker or source-code strings.

`npm run test:console:unit` runs the focused checks against the current compiled
TypeScript and canonical R sources. To exercise an existing build directly, use
`node scripts/verify-console-command-parity.js --host native` or `--host web`.
Use `--electron-app /path/to/executable` for an unpacked packaged application and
`--web-dist /path/to/web/output` for existing browser output.

The `Check console command parity` workflow runs on pushes and pull requests.
Its job is `Console command parity (native R and WebR)`; repository branch rules
can require this check. The shared production Electron and web verification
commands also run all seven console/script cases against their actual build
outputs (Chromium for web). Mutation checks independently restore whole-block
submission, final-value-only printing, and the script-selection bypass in copied
builds; all six host/defect combinations must fail the transcript assertion.
Local test success does not establish that a published or installed application
contains the change.

All test code used by these commands must be included in Git. The explicit
`.gitignore` exceptions keep the rendered helper and this document in clean
checkouts. Reports and screenshots are written under
`artifacts/console-command-parity/` and retained by CI.

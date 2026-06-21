# Dialog Product Parity Contract

DialogForge is not a from-scratch reimplementation of what an R dialog app
might be. DialogR and DialogQCA already exist as working applications. The
DialogForge task is to rewrite those working products into a clearer shared
architecture while preserving their behavior.

## Reference Applications

Reference paths:

- DialogR: `<DialogR repository>`
- DialogQCA: `<DialogQCA repository>`

DialogR and DialogQCA are the implementation oracles for current behavior,
assets, workflows, edge cases, and product-specific decisions. Positron remains
the conceptual UX oracle where its behavior is known, but a claimed Positron
correction must be explicit and documented.

## Rewrite Contract

For each product subsystem, the expected process is:

1. Inspect the relevant DialogR or DialogQCA source first.
2. Identify the current user-visible behavior and backend behavior.
3. Identify the DialogForge target home under `shared/`, `runtime`, or the
   selected product repository path.
4. Rewrite or adapt the behavior into that structure.
5. Verify the behavior at the subsystem level, not only with isolated
   presence checks.
6. Record any deliberate divergence before implementing it.

The goal is not to invent a similar replacement. The goal is to preserve the
working product while changing ownership boundaries, contracts, and internal
structure.

## Styling Contract

Internal code should be rewritten into the DialogForge structure. Styling should
not be redesigned.

For DialogR and DialogQCA product surfaces, styling parity means preserving the
reference application's visible HTML/CSS/assets as closely as the new structure
allows:

- layout order and geometry;
- spacing, padding, borders, radii, colors, shadows, and backgrounds;
- font families, font sizes, weights, line heights, and prompt typography;
- icon shapes, icon sizes, masks, SVGs, hover states, disabled states, active
  states, and focus states;
- Monaco/editor themes, token colors, active-line styling, gutters, scrollbars,
  and selection styling;
- window chrome-adjacent toolbar surfaces, panes, tabs, menus, dialogs, tables,
  grid headers, and status/footer areas.

Do not replace reference styling with a new approximation just because the
internal code is being rewritten. If markup must change for ownership reasons,
the resulting rendered surface should remain visually identical to the reference
unless a specific divergence is approved and documented before implementation.

When working on UI, inspect the reference HTML/CSS/assets first. Prefer carrying
over the reference class structure, CSS values, and asset shapes, then move the
behavioral code around those stable surfaces. A small local contract test may
guard a styling point, but it does not replace screenshot/manual comparison
against the reference application.

## Product Scope

The full parity contract includes at least:

- main console window layout, toolbar behavior, prompt handling, command
  transcript, history, completion, help shortcuts, interrupt, runtime state,
  errors, warnings, and zoom;
- workspace pane placement, window expansion, grouping, active dataset state,
  object remove/rename, `.RData` / `.rda` load/save, incremental runtime
  updates, context actions, and dataset opening;
- script editor as a separate window, with open, save, save-as, dirty-state
  handling, close prompts, run selection, run file, and console echo policy;
- import/data workflows, including DialogR/DialogQCA options, runtime-backed
  preview/import, generated visible commands, overwrite behavior, and package
  dependencies;
- data editor behavior, including data/variable panes, viewport behavior,
  selection, editing, row names, column names, metadata, value labels, declared
  missing values, clipboard behavior, context menus, and runtime-backed writes
  against real R objects;
- dialog runtime behavior, including imported dialog UI behavior, customJS
  calls, product-specific adapters, visible/hidden command policy, generated
  syntax, external calls, and end-to-end backend verification;
- help, packages, completions, plot viewer, settings, menus, accelerators,
  assets, i18n, and product metadata;
- lifecycle behavior, including runtime startup, restart, restore workspace,
  interrupt, crash/disconnect recovery, and quit-time child-process cleanup.

## Verification Standard

Small contract tests are useful as sentinels, but they are not the definition
of parity. A local sentinel such as "tabs are below panels" is only acceptable
when it sits under the broader subsystem contract that the entire data editor
must match the reference application's behavior.

Parity verification should prefer:

- source-level comparison against the reference behavior where direct UI smoke
  is not practical;
- Electron smoke tests for the real rendered product when possible;
- runtime-backed tests against real R objects for backend/data behavior;
- product-dialog interaction tests for dialogs and customJS paths;
- explicit audit entries for incomplete parity and deliberate divergences.

Do not mark a subsystem complete because a small structural assertion passes.
Completion means the working DialogR/DialogQCA behavior has been preserved or an
explicit, documented replacement decision exists.

## Product Separation Contract

DialogForge base verification must not depend on DialogR or DialogQCA
implementation files. Base tests may use neutral fixtures to verify product path
resolution, contribution loading, and shared contracts.

Product-specific tests and contracts belong with the product. DialogR and
DialogQCA keep those tests under their own repository `tests/` directories.

No product should be selected by package-script name or implicit local id. A
human or CI workflow selects an external product contribution by passing its
directory path to `npm start` or `npm run build`. The product does not build an
application independently; DialogForge compiles, stages, and packages it.

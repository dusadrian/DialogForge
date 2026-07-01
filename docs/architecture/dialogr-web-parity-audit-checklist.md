# DialogR Web Parity Audit Checklist

This checklist tracks the browser DialogR port against the actual DialogR /
DialogForge behavior contract. It supersedes earlier runnable-MVP checklists for
questions about complete user-experience parity.

## Progress Rule

Progress is point-based across audited feature families. Only `done` points
count. `partial`, `missing`, and `blocked` count as 0 until the item is either
implemented or split into smaller source-backed lines.

Current audited parity: **100 / 100 points = 100%**

This is not a count of every small UI interaction in DialogR. It is the current
source-backed audit of the main feature families needed for the web host to
behave like the DialogR app.

## Source Counts

| Source | Count | Status | Notes |
| --- | ---: | --- | --- |
| DialogR R dialogs | 11 | audited | `crosstable`, `frequencies`, `goto`, `independentsamplesttest`, `onesamplettest`, `recode`, `select`, `sortby`, `splitby`, `summaries`, `weightby`. |
| Dialog runtime package entries | 3 | audited | `frequencies` requires `admisc` and `declared`; `summaries` requires `admisc` and `declared`; `independentsamplesttest` requires `statistics`. |

## Checklist

| Area | Points | Status | Notes |
| --- | ---: | --- | --- |
| WebR runtime startup and transcript | 8 | done | Browser host starts WebR, renders a DialogR-style prompt, supports visible commands, completion, history, interrupt/restart controls, and package install transcript messages. |
| Bundled WebR package library | 6 | done | The product WebR package library is served from the bundled VFS and mounted before user commands run. |
| Dialog runtime package gate | 6 | done | The web server reads DialogR package requirements and the browser opens each dialog only after missing attached packages are loaded with visible `library(...)` commands. |
| Dialog modal shell | 6 | done | Dialogs render in draggable browser modals using the existing dialog builder frame and dialog CSS vocabulary. |
| Workspace pane core actions | 3 | done | Dataset grouping, active dataset switching and marker, toolbar active-dataset chip update, clear button, object delete affordance, double-click data-editor open, and WebR refresh are covered. |
| Full workspace pane parity | 3 | done | Source-backed pass against the shared workspace pane is complete: grouped datasets/matrices/values/functions/classes, active marker, clear action, hover delete, dataset-only make-active context menu, double-click dataset editor open, collapsed group state, and transient recent-row styling are represented in the browser host. |
| Console/workspace window geometry | 5 | done | Source-backed and browser-smoked: the workbench is draggable/resizable with remembered position, workspace collapse preserves console width and reopens outward, chevrons match the shared direction contract, and the command constructor uses the shared auto-height/manual-splitter sizing model. |
| Command constructor pane behavior | 4 | done | The constructor is hidden until dialog syntax exists, trims trailing blank lines, uses bounded content-driven auto-height, hides after Run, and uses DialogR/shared summary syntax for audited dialogs. |
| Full command constructor parity | 4 | done | Source-backed pass complete: the browser constructor uses the shared console syntax colorizer, shared trim/hidden/auto-height/manual-splitter behavior, shared sort/filter/split/weight/select/state bindings, and the shared summary command builder with parent-owned WebR state bridges only where the browser host owns split/weight/filter workspace state. |
| Dialog rendering controls | 8 | done | Browser dialogs render inside the existing dialog-builder frame with the DialogCreator/DialogR control vocabulary; labels, buttons, custom checkboxes/radios, inputs, selects, containers, choice lists, disabled rows, transfer buttons, search overlays, keyboard selection, and representative rendered states are source-backed and browser-smoked. |
| Dialog variable filters and container search | 3 | done | Browser containers preserve disabled-but-visible variables for audited cases, workspace-bound dialogs bind from the parent WebR workspace with a fallback for startup snapshots, and Cmd/Ctrl+F container search is covered for the frequency-variable list. |
| Full DialogCreator container parity | 3 | done | Custom browser containers now preserve disabled-but-visible rows, Cmd/Ctrl+F search, keyboard focus movement, Enter/Space selection, Home/End movement, Cmd/Ctrl+A multi-select, Shift range selection, and transfer-button direction updates across the audited list surfaces. |
| Dialog command construction | 10 | done | Frequencies, crosstabs, one-sample t-test, recode, sort-by, select, split-by, weight-by, go-to, and summaries have browser coverage; summaries, sort-by, workspace binding, filter/split/weight state, select-expression binding, subset-state inheritance, descriptor-object variable normalization, and safe shared dialog external calls now use shared DialogForge bindings or parent-owned workspace/state bridges. |
| Numerical summaries dialog | 5 | done | Uses the DialogR/shared `wsummary`, `wquantile`, and `wmeasures` command contract; no command is shown until a variable and statistic are selected. |
| Dialog result rendering | 6 | done | Visible WebR commands and dialog commands now use the shared console transcript service/renderers with stream-preserving Shelter capture for stdout/stderr/messages, shared prompt/continuation rendering, preformatted table output, styled warnings/errors, package attachment messages, and plot-image handoff to the shared plot viewer. |
| Modal position persistence | 4 | done | Dialog and console modal positions are remembered after being moved. |
| Plot viewer modal and history | 3 | done | WebR graphics capture opens the shared plot viewer modal, prewarms the hidden plot iframe after runtime startup, appends captured plots across commands, and keeps the shared history, thumbnail selection, zoom, copy, and save surface connected. |
| Full plot viewer parity | 1 | done | Browser save/copy/reset actions now route through the same shared plot viewer contract as Electron: save returns desktop-shaped status results and uses the system save picker where available, copy returns copied/failed status without console noise, and reset waits for the WebR invisible mutation. |
| Top menu shell | 4 | done | Dialogs are exposed through a DialogR-style top menu instead of the earlier left-side list. |
| Data editor viewing and first-screen edits | 2 | done | The browser shell opens a draggable/resizable WebR-backed data editor modal from workspace dataset double-click, with DialogR-style Data and Variables tabs, first-screen reads, full-size virtual scrollbars based on total rows/columns, arbitrary viewport fetch for Data and Variables scroll positions, editable data cells, selected-cell copy/paste, typed cell replacement, resizable Variables columns, and editable variable name/label/measure fields. |
| Data editor value labels and declared missing | 1 | done | The browser Variables-tab Values cell opens a draggable value-label modal, carries category labels, missing flags, and missing range state from WebR, writes edits through `labels`, `na_values`, `na_range`, and `declared` metadata, and verifies a missing-flag round trip against `iris$Species`. |
| Data editor interaction parity | 4 | done | Data-cell, header, row, variable-row, and variable-cell selection hooks now use the desktop data attributes; Variables metadata ranges support Shift selection; context menus use the desktop menu ids/actions; paste-only variable-range menus are rendered; and column add/rename/remove/sort plus row add/remove are WebR-backed and Playwright-verified. |
| Data editor row-name inline parity | 1 | done | Data snapshots render WebR row names in row-header cells and use the desktop `data-rowname-editor` inline editor contract for row-name rename, including Enter commit, Escape cancel, and blur commit. |
| Help page modal | 2 | done | `?topic`, `help(topic)`, and contextual console help open a draggable browser help modal using the base help viewer and rendered WebR help HTML; the R help contents navigation follows the shared R help responsive contract, with `nav.topic` on the left for wide frames and hidden for narrow frames. |
| Script editor modal and run workflow | 2 | done | The browser shell has a draggable/resizable Monaco R script editor modal with per-tab Monaco models, dirty markers, new/open local file, save/download, contextual help, and run selection/full-buffer execution echoed through the WebR console. |
| Script editor Enter shortcut parity | 0 | done | Tracked sub-slice under full script-editor parity: plain Enter is consumed inside Monaco and creates a new script line only; Cmd/Ctrl+Enter is the only keyboard path that sends script code to the WebR console. |
| Full script editor parity | 1 | done | Browser script editor tabs now restore through the shared session-key contract, local save/open keeps native file-handle overwrite semantics during the browser session, dirty close uses save / don't-save / cancel resolution, the tab strip uses the DialogForge script-window chrome, and Playwright verifies Enter, dirty-close cancellation, and discard behavior. |

## Current Missing Feature Families

The current source-backed audit has **no known materially incomplete feature
families**. Remaining future work should be tracked as newly discovered parity
bugs against the real DialogR/DialogForge source behavior, not as known broad
missing families.

## Next Implementation Slice

Treat newly discovered parity bugs as source-backed slices. Reproduce against
the DialogR/DialogForge reference, adapt the browser host through shared
contracts where possible, and verify with Playwright for visible behavior.

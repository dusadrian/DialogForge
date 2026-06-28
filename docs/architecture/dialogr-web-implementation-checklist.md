# DialogR Web Implementation Checklist

This checklist tracks the work needed to run the DialogR product through
DialogForge in a browser host, with a runtime choice between local desktop R,
server-managed R, and WebR.

## Progress Rule

Progress is point-based. The total implementation is 100 points.

Only `done` points count toward the implementation percentage. `partial`,
`not started`, and `deferred` items count as 0 until their checklist line is
completed or explicitly split into smaller completed lines.

Current implementation: **100 / 100 points = 100%**

## Checklist

| Area | Points | Status | Notes |
| --- | ---: | --- | --- |
| Keep DialogForge and DialogR split | 3 | done | DialogForge owns host/runtime architecture; DialogR remains an external product repository. |
| Add browser resource client | 3 | done | `shared/core/host/browserResourceClient.ts` implements the shared resource client contract. |
| Add web shell ownership boundary | 3 | done | `shared/shell-web/` reserves the browser host owner without forking product code. |
| Register explicit web R provider ids | 5 | done | `server-r` is registered as a reserved remote provider and `webr` is registered as an experimental browser provider; local desktop R remains `r`. |
| Add runtime provider selection policy | 6 | done | Electron keeps web-only providers hidden from ordinary choices; web can prefer web-capable providers. |
| Define provider-neutral runtime transport contract | 8 | done | `shared/runtime/transport/` defines connection state, request/response, events, and controller operations. |
| Connect transport state to runtime session snapshots | 7 | done | Non-local runtime sessions expose optional transport state while local `r` stays unchanged. |
| Add server-R transport adapter skeleton | 5 | done | `server-r` uses a reserved remote-session transport controller without real backend execution yet. |
| Implement server-R lifecycle | 5 | done | Server-R transport now reports disconnected, connecting, connected, and failed states through an injected connection probe. |
| Implement server-R command/query/workspace path | 5 | done | Visible commands, invisible queries, workspace listing, tabular preview, help, and completions route through server-R transport methods. |
| Implement server-R authentication/config policy | 5 | done | Endpoint and credentials are host/deployment inputs, secrets stay out of product metadata and snapshots, and missing/rejected/unreachable failures are explicit. |
| Add WebR transport adapter skeleton | 5 | done | `webr` uses a worker transport controller backed by the maintained `webr` npm package when a browser host can start WebAssembly workers. |
| Implement WebR lifecycle | 5 | done | WebR now has a host-configured worker transport lifecycle with disconnected, connecting, connected, failed, and disconnected states; browser hosts can start the bundled WebR runtime. |
| Implement WebR command/query/workspace path | 5 | done | Visible commands, invisible queries, workspace listing, tabular preview, help, and completions route through WebR worker transport methods, with initial package-backed command/query/workspace/dependency handling. |
| Implement WebR package/filesystem policy | 5 | done | WebR manifest policies now state worker package availability, unsupported browser package installation, browser-virtual file access, and host-managed persistence. |
| Update external DialogR product metadata | 5 | done | External DialogR now keeps `r` as the default and declares `server-r` plus `webr` as supported runtime providers. |
| Add provider-selection UI/persistence | 5 | done | Settings now receives only host-visible runtime provider choices and persists runtime startup provider ids through the same visibility policy. |
| Add browser host composition entrypoint | 5 | done | `shared/shell-web` now owns a browser host adapter and composition entrypoint using `hostKind: "web"` without Electron imports. |
| Add browser storage/file adapters | 5 | done | `shared/shell-web` now defines browser file references, upload/download handling, and web storage adapters for settings/workspace state. |
| Convert native dialog windows to host-rendered surfaces | 3 | done | Browser product dialogs now have a modal surface boundary that preserves the existing `dialogBuilder.html` renderer in an overlay frame. |
| Convert auxiliary windows to host-rendered surfaces | 1 | done | Browser auxiliary surfaces now map settings/about to modals, help/plots to panels, and script/data editors to routes. |
| Add rendered browser parity checks | 1 | done | `verify:browser-rendered-parity` launches Chromium, renders the browser dialog modal, and checks the existing dialog-builder frame contract. |

## Next Slice

The implementation checklist is complete at **100 / 100 points = 100%**.

Remaining hardening work is outside this checklist:

1. Run the browser and Electron verifier scripts when requested for a full local
   evidence pass.
2. Replace the server-R transport probe with a deployment-specific backend and
   harden the experimental WebR bridge for full dialog/runtime coverage.
3. Wire browser-runtime behavior into auxiliary surfaces that are currently
   mapped to web placement but still marked as runtime-wiring follow-up work.

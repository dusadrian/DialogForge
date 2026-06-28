# DialogR WebR Hardening Checklist

This checklist tracks the work needed to make DialogForge's experimental WebR
provider behave more like a production runtime for DialogR, using the useful
runtime lessons from the MetadataPublisher-WebR implementation while preserving
DialogR's interactive console model.

## Progress Rule

Progress is point-based. The total implementation is 100 points.

Only `done` points count toward the implementation percentage. `partial`,
`not started`, and `deferred` items count as 0 until their checklist line is
completed or explicitly split into smaller completed lines.

Current implementation: **100 / 100 points = 100%**

## Checklist

| Area | Points | Status | Notes |
| --- | ---: | --- | --- |
| Keep DialogR command model interactive | 5 | done | DialogForge keeps separate visible command, invisible query, workspace, tabular, help, completion, and dependency transport methods instead of routing all runtime work through one command wrapper. |
| Import the maintained WebR package | 7 | done | `webr` is an application dependency and is staged as a runtime dependency with worker and WebAssembly assets. |
| Add a WebR bridge behind the provider transport | 5 | done | `shared/runtime/providers/webr/webRRuntimeBridge.ts` dynamically imports `webr` and routes initial command/query/workspace/dependency methods through a WebR instance. |
| Add a provider-local WebR operation queue | 10 | done | `webRRuntimeBridge` now serializes WebR startup and request execution so eval, filesystem, package, and workspace calls cannot race each other. |
| Add a shared WebR initialization guard | 10 | done | The WebR bridge now reuses one startup promise, tracks initialized state, resets failed startup, and clears state on close. |
| Add robust WebR asset base resolution | 10 | done | `webRAssetBase` resolves explicit browser deployment URLs and installed/staged `webr/dist` package assets for development, built `dist/`, and packaged layouts. |
| Add host-specific Worker path normalization | 8 | done | `webRNodeWorkerPath` adapts MetadataPublisher's Node Worker target normalization before `webr` is imported, while remaining a no-op in browser hosts. |
| Add WebR filesystem mount boundary | 10 | done | `webRFilesystemMount` defines provider-level `WORKERFS`, `NODEFS`, and `IDBFS` mount requests; the WebR bridge exposes them through the serialized runtime queue while host-owned code supplies native roots. |
| Add product/runtime bootstrap hook | 10 | done | `runtimeBootstrap` can carry a WebR bootstrap plan with mounts, helper source files, and startup commands that run after `webR.init()` through the serialized bridge queue. |
| Add DialogR package/library bootstrap policy | 8 | done | `webRPackageLibraryPolicy` converts browser-served package libraries, helper asset mounts, helper source files, and startup commands into the WebR bootstrap plan. |
| Improve visible command transcript mapping | 7 | done | WebR visible commands use captured output and map submitted, output, error, and completed transcript events in DialogR console order. |
| Improve invisible query/result conversion | 5 | done | WebR invisible queries use typed raw conversion first and a string fallback without writing visible console history. |
| Add WebR runtime readiness integration | 5 | done | The WebR provider now owns a lifecycle controller that starts and stops the worker transport and exposes ready, failed, starting, and stopped session snapshots. |
| Add WebR hardening verifiers | 0 | done | Contract scripts now cover queueing, startup reuse, asset resolution, worker path normalization, filesystem mounts, bootstrap hooks, package policy, transcript mapping, query conversion, and readiness. |

## Source Lessons From MetadataPublisher-WebR

The useful reference patterns are:

1. Serialized backend operations through a promise queue.
2. Lazy WebR constructor loading after any host worker setup.
3. Host-aware `baseUrl` resolution for WebR's JavaScript and Wasm assets.
4. A single initialization promise that resets cleanly on startup failure.
5. Filesystem mounting for packaged R assets and helper sources.
6. Runtime readiness wiring that keeps the user interface honest during startup.

## Completion

The WebR hardening checklist is complete at **100 / 100 points = 100%**.
Further work should move to browser-host rendering, deployment packaging, and
full rendered-browser verification rather than adding more hardening rows to
this checklist.

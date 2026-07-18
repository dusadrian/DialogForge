# Phase 0 iroh compatibility diagnostic

This isolated diagnostic proves that the native `@number0/iroh` 0.35.0 N-API
binding loaded by DialogForge's Electron runtime can exchange a bounded frame
with Rust `iroh` 0.35.0 compiled for a browser. It is not application transport
code and is intentionally outside `src/`.

The native peer must be launched with Electron's embedded Node runtime and with
`DIALOGFORGE_IROH_MODULE_ROOT` pointing to an installed `@number0/iroh` 0.35.0
package. The browser crate is pinned to the matching Rust core and uses the
DialogForge live-script ALPN.

The evidence and exact commands from the accepted run are recorded in
`internal/live-script-sharing-iroh-roadmap.md`.

Build the browser peer with the pinned toolchain:

```sh
CC_wasm32_unknown_unknown=/opt/homebrew/opt/llvm/bin/clang \
AR_wasm32_unknown_unknown=/opt/homebrew/opt/llvm/bin/llvm-ar \
cargo build --release --target wasm32-unknown-unknown

wasm-bindgen \
    --target web \
    --out-dir browser/pkg \
    target/wasm32-unknown-unknown/release/dialogforge_iroh_phase0_wasm.wasm
```

Launch `native-echo.js`, serve `browser/`, and open `index.html` with the
reported node ID, relay URL, and a bounded `frame` query parameter. A successful
run marks `#result` as `data-status="passed"` and prints the same frame from the
native process.

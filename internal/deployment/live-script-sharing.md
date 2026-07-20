# Live Script Sharing Deployment

Live Script Sharing is enabled by default on a host only when its transport is
available. Electron requires the packaged `@number0/iroh` native module.
Browser hosting and joining require a secure context, WebAssembly, the pinned
DialogForgeIroh artifact, and the web server's cross-origin isolation headers.

Set the following environment variable to disable both hosting and joining for
an Electron or web deployment:

```sh
DIALOGFORGE_LIVE_SCRIPT_ENABLED=false
```

Accepted disabled values are `false`, `off`, and `0`, without regard to case.
This is a deployment policy, not a per-product behavior fork. DialogR,
DialogQCA, and the base app consume the same shared capability result.

## Invite-Code Service

The default production origin is:

```text
https://dialogforge-live-script-rendezvous.dusa-adrian.workers.dev
```

Both Electron and the DialogForge web server accept a compatible replacement:

```sh
DIALOGFORGE_LIVE_SCRIPT_RENDEZVOUS_URL=https://live-code.example.org
```

The URL is public configuration and must use HTTPS. Do not put an encryption
key, Cloudflare credential, or revocation token in product metadata. The
service contract is `services/live-script-rendezvous/openapi.yaml`; deployment
and key-rotation steps are in `services/live-script-rendezvous/README.md`.

A compatible service must provide atomic code creation, bounded collision
retries, encrypted ticket storage, hashed revocation tokens, immediate
revocation, expiry deletion, failed-lookup throttling, and the same generic 404
body for malformed, missing, expired, revoked, and throttled codes. It must not
store script contents.

## Browser Join Links And QR Images

The browser host automatically uses its current origin and entry path for
copied links and QR images. An Electron deployment can point copied links and
QR images to a deployed DialogForge web application:

```sh
DIALOGFORGE_LIVE_SCRIPT_BROWSER_URL=https://classroom.example.org/
```

Without this setting, Electron still provides the complete authenticated
invitation and the mandatory three-word code, but the complete invitation uses
the `dialogforge://` paste format rather than a browser URL. The short code is
the supported computer-only path when no link can be delivered.

## Relay Policy

Ordinary deployments use iroh's configured public relay infrastructure and do
not need a DialogForge relay server. Relays carry encrypted peer traffic and
do not replace the invite-code service.

The separate DialogForgeIroh repository contains an interoperability-verified
self-hosted iroh 0.35 relay diagnostic and deployment notes. DialogForge does
not currently expose a production application setting that forces all clients
to a private relay. Treat private-relay operation as a diagnostic/deployment
extension until a supported relay-policy input is added; do not encode relay
URLs into product behavior or combine rendezvous state with the stateless
relay process.

## Release Checks

Before enabling a new host or deployment:

1. verify `/healthz` on its invite-code service;
2. publish, resolve, join, revoke, and reject-after-revoke a three-word code;
3. verify the pinned WASM manifest, checksums, MIME type, and immutable paths;
4. exercise a rendered host and participant, including stop and reconnect;
5. confirm received text does not execute automatically;
6. record the supported participant count and latency target;
7. exercise presenter sleep/wake while a participant is connected;
8. perform the approved-language human read-aloud check.

The current controlled target is 30 participants. Fifty participants is a
measured stretch case rather than a release guarantee.

# Live-script invite-code service

This service maps a temporary spoken code to a complete live-script ticket. It
does not relay iroh traffic and must never receive or store script contents.

One deployment serves every supported desktop platform and product. Cloudflare
creates one strongly consistent Durable Object for each three-word code; do not
create separate Workers for individual sessions, operating systems, or
classrooms.

The Cloudflare implementation uses one SQLite-backed Durable Object per code,
atomic creation, an expiry alarm, encrypted ticket storage, hashed revocation
tokens, and lookup throttling. Configure its 32-byte base64url encryption key
as the `TICKET_ENCRYPTION_KEY` Wrangler secret before deployment.

## Cloudflare deployment

The Worker uses Wrangler 4.112 and requires Node.js 22 or newer. It is ready to
deploy from its own directory:

```sh
cd services/live-script-rendezvous/cloudflare
npm install
npx wrangler login
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))" \
    | npx wrangler secret put TICKET_ENCRYPTION_KEY
npm run deploy
```

Wrangler prints the HTTPS `workers.dev` URL. Confirm the required bindings and
secret through the health endpoint before configuring an application build:

```sh
curl https://<worker-name>.<account-subdomain>.workers.dev/healthz
```

The response must contain `{"ok":true}`. The encryption key is generated once
and must remain stable while live sessions exist. Rotating it immediately
invalidates all published classroom codes, which is safe but disruptive.

The application endpoint is the Worker origin without `/healthz`. Do not put
the encryption key or a Cloudflare account credential in an application
manifest.

The production DialogForge deployment is:

```text
https://dialogforge-live-script-rendezvous.dusa-adrian.workers.dev
```

Desktop builds use this origin by default. Set
`DIALOGFORGE_LIVE_SCRIPT_RENDEZVOUS_URL` only to test another compatible
deployment; the application receives the public origin, never the encryption
secret.

`openapi.yaml` is also the self-hosted contract. A replacement service
must preserve atomic collision responses, identical missing/expired/revoked/
throttled lookup failures, bounded ticket and expiry validation, immediate
revocation, encrypted storage, and deletion at expiry. It remains a separate
process or container from the stateless `iroh-relay`.

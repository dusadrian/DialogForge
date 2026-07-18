# Live-script rendezvous

This service maps a temporary spoken code to a complete live-script ticket. It
does not relay iroh traffic and must never receive or store script contents.

The Cloudflare implementation uses one SQLite-backed Durable Object per code,
atomic creation, an expiry alarm, encrypted ticket storage, hashed revocation
tokens, and lookup throttling. Configure its 32-byte base64url encryption key
as the `TICKET_ENCRYPTION_KEY` Wrangler secret before deployment.

`openapi.yaml` is also the self-hosted Hetzner contract. A replacement service
must preserve atomic collision responses, identical missing/expired/revoked/
throttled lookup failures, bounded ticket and expiry validation, immediate
revocation, encrypted storage, and deletion at expiry. It remains a separate
process or container from the stateless `iroh-relay`.

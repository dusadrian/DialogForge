# DialogForge live-script protocol version 1

Version 1 is a single-writer protocol. The instructor is authoritative for
document content, revisions, permissions, and session termination. Participants
may send `join`, `ack`, `resync-request`, `ping`, and `pong`; they may never send
`edit`, `snapshot`, or `session-ended`.

Each transport record is a four-byte unsigned big-endian length followed by one
UTF-8 JSON object. The maximum encoded JSON frame is 1 MiB. Snapshot content is
limited to 768 KiB, edit text to 256 KiB per edit, and one edit frame to 256
ordered, non-overlapping Monaco-compatible changes. Transport implementations
must reject an incomplete prefix, a length mismatch, invalid UTF-8, an
oversized record, unknown fields, or a frame that fails the versioned parser.

All frames carry the protocol identifier, protocol version, opaque session ID,
message type, authenticated sender endpoint ID, and a positive monotonic
message number. Cursor, participant-health, ping, and pong frames also carry a
timestamp because those values are transient diagnostics or presence. Durable
document frames do not carry wall-clock time.

The instructor may combine consecutive Monaco changes into one `edit` frame.
One frame is one revision regardless of the number of changes in the batch.
Changes are ordered by their offsets in the pre-edit document and must not
overlap. A renderer may use a short batching interval, but it must flush before
a snapshot, session end, or any operation whose ordering would otherwise be
ambiguous.

A participant becomes active only after an accepted `welcome` and authoritative
`snapshot`. It applies an `edit` only when `baseRevision` equals its current
revision and `revision` is exactly the next revision. It then sends one `ack`.
On a missing revision or invalid edit it sends one `resync-request` and waits
for a snapshot; further mismatched edits do not create a request loop. A
snapshot clears the pending resync and is acknowledged. Duplicate message
numbers are ignored.

The session capability in `join` is separate from the iroh endpoint identity.
An endpoint identity authenticates the connection; the capability authorizes
the session. Failed authorization uses a bounded generic response. Tickets and
frames expose only an opaque transport address, session ID, capability,
protocol range, optional expiry, and sanitized basename. They never expose a
local file path, workspace, runtime, settings, environment, or credentials.

The JSON fixtures in this directory are the cross-language contract for the
future Rust/WASM client. TypeScript acceptance coverage parses every valid
message type and rejects the malformed fixtures.

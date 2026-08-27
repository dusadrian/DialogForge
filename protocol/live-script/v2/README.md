# DialogForge live-script protocol version 2

Version 2 retains the instructor-authoritative, single-writer document stream
from version 1 and adds instructor-granted student spotlighting.

Each join frame carries a classroom-scoped nickname and a stable participant
identifier. The instructor normalizes nicknames with Unicode compatibility
normalization, collapsed whitespace, and case-insensitive comparison. A name
already reserved by another participant is rejected with `nickname-taken`.
The stable participant identifier preserves that reservation while a client
reconnects with a new transport endpoint; permanent departure releases it.
Nicknames are entered explicitly and are never inferred from an operating-
system account, computer name, path, or email address.

A participant raises a hand with an empty `hand-raise` payload. This is the
student's offer of the locally fixed Script Editor tab; no tab name or content
is transmitted with the request. The instructor may dismiss it or send
`spotlight-control: granted`. Only that endpoint may then publish a sanitized
tab basename plus content through `spotlight-snapshot`, followed by ordered
`spotlight-edit` and `spotlight-cursor` frames. The instructor validates those
frames and republishes ordinary authoritative `welcome`, `snapshot`, `edit`,
and `cursor` frames to the whole class.

Raised-hand and active-spotlight UI uses the reserved classroom nickname. The
empty hand frame still carries no script name, path, or content.

The instructor client renders an active student stream in a temporary
read-only spotlight tab. Ending the spotlight removes that view and activates
the original instructor tab; it does not turn received student code into a
saved instructor document.

At most one spotlight source exists at a time. The instructor remains the
session authority and may end the spotlight. The student may lower the hand,
end the spotlight, close the offered tab, or disconnect. Each case restores an
authoritative snapshot of the instructor's current script. Instructor edits
made during the spotlight are retained locally and become the restored
document; they are not mixed into the student's stream.

Version 2 remains deliberately single-writer. A grant changes the temporary
document source; it does not allow general multi-writer editing or remote
execution. Received code never executes automatically, and Run continues to
use each participant's local runtime.

Transport records retain version 1's four-byte unsigned big-endian length,
UTF-8 JSON encoding, frame and content bounds, monotonic message numbers,
strict field validation, revision rules, capability authorization, expiry,
and encrypted transport requirements. Tickets and ordinary frames do not
expose local paths, workspace, runtime, settings, environment, or credentials.

The JSON fixtures in this directory are the cross-language contract for
protocol version 2.

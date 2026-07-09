# Server R Runtime Provider

This provider id is reserved for a browser-compatible R runtime backed by a
server-managed R session.

It is not the local desktop `r` provider. The local provider starts an R process
from the user's machine. `server-r` should eventually talk to an authenticated
remote or companion service while preserving the same provider-neutral session,
workspace, tabular, help, completion, dependency, plot, and command contracts.

Until the transport exists, this provider is a registered placeholder only. It
must not pretend to have evaluated commands in a real R session.

# WebR Runtime Provider

This provider id runs an in-browser WebR runtime through the maintained `webr`
npm package when a browser host supplies a WebR asset base URL.

WebR has different constraints from local or server-managed R: package
availability, filesystem access, startup cost, persistence, and browser memory
limits all need explicit provider behavior. It should therefore be implemented
as its own provider instead of being hidden behind the local `r` provider.

The provider exposes its browser limits through manifest policies. Package
availability is checked by the worker runtime, but package installation is not a
DialogForge browser-host operation. File access is browser-virtual, and durable
persistence must be supplied by the host or product workflow rather than assumed
to be a native filesystem path.

The runtime bridge dynamically imports `webr`, starts `new WebR(options).init()`,
and routes visible commands, invisible queries, workspace listing, tabular
preview, and package availability through the WebR instance. Contract tests can
still inject a transport probe to exercise lifecycle and routing without
starting WebAssembly.

# Runtime Provider Contract

The runtime provider contract lets the base app run with different languages.

The provider owns language-specific behavior:

- process/session lifecycle;
- visible command execution;
- invisible GUI queries and mutations;
- workspace/object listing;
- tabular data schema, read, and write operations;
- metadata/value-label equivalents when supported;
- help and completions;
- dependency checks;
- prompts and input requests.

The base app owns feature decisions:

- enabled;
- visible but disabled with a clear reason;
- hidden because the feature is not meaningful;
- replaced by a provider-specific implementation.

## Provider Boundary

Runtime providers are registered through factories. A provider exposes:

- a manifest, used by composition and capability evaluation;
- a provider-neutral session snapshot, used by the shell and renderer;
- later lifecycle methods, routed through shared runtime contracts rather than product or language checks.

The current `r` provider starts an R runtime-control process for DialogR and DialogQCA. The `python` provider is still reserved as a placeholder capability surface for a future runtime implementation.

## Session Snapshot

```text
providerId
status
connection
message
```

Initial lifecycle states:

```text
not-started
starting
ready
failed
stopped
```

The base app can display this state, but it must not branch on language names. Product and feature availability comes from capabilities, not from `providerId`.

Start and stop requests are routed through the shared runtime session manager. Placeholder providers may transition to `ready` without starting a process; that means the provider boundary is active, not that R or Python has been launched.

## Visible Commands

Visible commands are provider-neutral requests:

```text
kind
text
source
createdAt
```

The first supported kind is `commands.visible`. The runtime session manager returns transcript events instead of writing directly to UI state:

```text
submitted
output
completed
rejected
```

Visible commands require a `ready` runtime session. Placeholder providers can emit transcript events, but they must not start a real language process or pretend to have evaluated code.

## Workspace Objects

Workspace refresh returns a provider-neutral snapshot:

```text
status
providerId
objects
message
refreshedAt
```

Each object has:

```text
name
kind
detail
capabilities
```

Workspace refresh requires a `ready` runtime session. Placeholder providers may return representative objects for UI and contract testing, but they must not query a real language process.

## Active Dataset

Active dataset state is provider-neutral:

```text
status
providerId
objectName
message
selectedAt
```

Only workspace objects that advertise `tabular.read` can become active datasets. The base app may use active dataset state to choose preview/editor targets, but it must not infer language behavior from object names or provider IDs.

## Tabular Preview

Tabular preview returns a provider-neutral schema/read snapshot:

```text
status
providerId
objectName
columns
rows
message
readAt
```

Each column has:

```text
name
type
role
```

Tabular preview requires a `ready` runtime session and a workspace object that advertises `tabular.read`. This boundary is read-only; edits and metadata writes belong to later contracts.

## Cell Updates

Cell updates use provider-neutral request/result shapes:

```text
objectName
rowIndex
columnName
value
```

Results include:

```text
status
providerId
objectName
rowIndex
columnName
value
message
updatedAt
```

Cell updates require a `ready` runtime session and a tabular object. Placeholder providers update in-memory rows only; they must not start or mutate a real language process.

## Variable Metadata

Variable metadata snapshots are provider-neutral:

```text
status
providerId
objectName
variables
message
refreshedAt
```

Each variable has:

```text
name
type
role
label
```

Metadata refresh requires a `ready` runtime session and a tabular object. This boundary is read-only; metadata writes, value labels, and declared missing values belong to later contracts.

## Value Labels

Value-label snapshots are provider-neutral:

```text
status
providerId
objectName
valueLabels
message
refreshedAt
```

Each value-label set has:

```text
variable
labels
```

Each label has:

```text
value
label
```

This boundary is read-only. Providers that do not support value labels should return an empty list with an explanatory message instead of making the base app branch on language.

## Declared Missing Values

Declared-missing snapshots are provider-neutral:

```text
status
providerId
objectName
declaredMissing
message
refreshedAt
```

Each declared-missing set has:

```text
variable
values
```

Each value has:

```text
value
label
```

Providers without declared-missing semantics should report `unsupported` for the object instead of forcing the base app to know the language.

## Initial Capabilities

```text
commands.visible
commands.invisible
workspace.objects
workspace.activeDataset
tabular.schema
tabular.read
tabular.writeCells
tabular.writeColumns
tabular.rowNames
tabular.columnNames
tabular.variableMetadata
tabular.valueLabels
tabular.declaredMissing
help.topics
completions.symbols
dependencies.packages
```

Capabilities are additive. A provider should not claim support until the behavior is implemented and tested.

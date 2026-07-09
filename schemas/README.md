# DialogForge Schemas

This directory contains JSON schema files that describe public file formats used
by DialogForge and product repositories.

At the moment there is one schema:

- `dialog.schema.json` describes the `dialog.json` files exported by
  DialogCreator and consumed by DialogForge dialogs.

## Why This Directory Exists

The schemas are not application code. They are contracts between tools:

- DialogCreator exports dialog definitions.
- Product repositories such as DialogR and DialogQCA include those dialog
  definitions.
- DialogForge validates and runs them.
- Editors such as VS Code can use the schema to help humans inspect or adjust a
  `dialog.json` file.

Keeping these contracts in `schemas/` makes them easier to find than if they
were buried under `src/`.

## What `dialog.schema.json` Checks

The dialog schema checks the shared structure that every supported dialog source
must have. It verifies, for example, that:

- the root value is an object;
- the dialog has `properties` and `elements`;
- `properties.name` and `properties.title` are present;
- each element has a `type`;
- each element has at least one identifier, such as `id`, `name`, or `nameid`;
- common fields such as dimensions, labels, visibility, enabled state,
  localization, syntax, and runtime-provider metadata have reasonable JSON
  types.

The schema is intentionally about the common exported dialog shape. It does not
replace product-specific checks, cross-file checks, runtime checks, or
DialogCreator's own authoring rules.

## How DialogForge Uses It

DialogForge reads `dialog.schema.json` when validating product dialog sources.
If a registered product dialog points to a malformed `dialog.json`, validation
can fail early with a structural error before the dialog reaches the runtime.

## How Humans Can Use It

When editing or inspecting dialog files in VS Code, attach this schema to
`dialog.json` files. For a product repository next to DialogForge, the setting
usually looks like this:

```json
{
    "json.schemas": [
        {
            "fileMatch": ["dialogs/**/dialog.json"],
            "url": "../DialogForge/schemas/dialog.schema.json"
        }
    ]
}
```

If your folder layout is different, keep the `fileMatch` pattern for product
dialogs and adjust only the `url`.

## Future Schemas

Add new files here only when they describe a real public JSON contract. Possible
future candidates include product registry files, menu files, or locale files,
if a schema would make contributor work clearer than custom validation alone.

# Adding Dialogs

This guide describes the source-owned development workflow for adding dialogs to
DialogForge and to product repositories such as DialogR or DialogQCA.

The short rule is:

- shared dialogs live in DialogForge under `shared/base-app/dialogs/`;
- product dialogs live in the selected product repository under `dialogs/`;
- authoring import uses `.dc.zip` DialogCreator packages;
- menu entries live in the same layer that owns the menu item.

Product dialogs belong in the product repository. DialogForge launches and
composes products by path, while the product repository remains the source of
truth for product-specific dialog source, menu placement, capability requirements,
translations, and tests.

## What A Dialog Package Contains

DialogCreator saves portable dialog packages as `.dc.zip` files. The package
must contain:

- `dialog.json`, the declarative dialog definition;
- `actions.js`, the dialog-local JavaScript behavior;
- optional dialog-local support files.

The DialogForge development import unpacks the `.dc.zip` package into an editable
dialog directory.

## Where The Files Go

Use the owner of the behavior to choose the target.

For a shared dialog:

```text
shared/base-app/dialogs/<provider>/<dialog-id>/
    dialog.json
    actions.js
```

For a product dialog:

```text
<product-repository>/dialogs/<provider>/<dialog-id>/
    dialog.json
    actions.js
```

Use lowercase provider buckets, e.g. for R dialogs, use `r`.

The dialog ID should match `properties.name` inside `dialog.json`. It must be a
single identifier-style word: letters, numbers, and underscores, with no leading
digit. The import path uses that name for the target directory and registry ID.

## Development Import Behavior

When authoring features are enabled, the menu customization window can browse
for a DialogCreator package.

In base mode, importing a package writes to:

```text
shared/base-app/dialogs/<provider>/<dialog-id>/
shared/base-app/dialogs/dialogs.json
```

In product mode, importing a package writes to the selected product repository:

```text
<product-repository>/dialogs/<provider>/<dialog-id>/
<product-repository>/dialogs/dialogs.json
```

That is intentionally different from user-local production customization. In
development, the import updates source files that should be reviewed and
committed.

## Registering The Dialog

Every source-owned dialog needs an entry in the owning `dialogs/dialogs.json`.
For a product dialog the entry usually looks like:

```json
{
    "id": "exampleDialog",
    "label": "Example dialog",
    "owner": "products/ProductId",
    "targetHome": "products/ProductId/dialogs/r/exampleDialog/",
    "sourceReference": "path-or-note-about-original-package",
    "sourceFile": "r/exampleDialog/dialog.json",
    "status": "source-imported",
    "replacement": "Run through the DialogCreator-compatible DialogForge dialog runtime."
}
```

For a shared dialog, use:

```json
{
    "id": "exampleDialog",
    "label": "Example dialog",
    "owner": "shared/base-app",
    "targetHome": "shared/base-app/dialogs/r/exampleDialog/",
    "sourceFile": "r/exampleDialog/dialog.json",
    "status": "source-imported"
}
```

`sourceFile` is relative to the owning `dialogs/` directory. `targetHome`
describes the owning directory, not just the JSON file.

DialogForge validates each registered `sourceFile` before packaging a product.
The referenced `dialog.json` is checked against
[`schemas/dialog.schema.json`](../../schemas/dialog.schema.json) and must be
valid JSON with:

- a root object;
- `properties.name`;
- `properties.title`;
- an `elements` array;
- element objects with `type` and either `id`, `name`, or `nameid`;
- string-valued entries inside dialog-local `i18n.locales`, when present.

### Editor Help For `dialog.json`

DialogCreator is the preferred place to design and edit dialogs. If you inspect
or adjust a `dialog.json` file in VS Code, attach the schema so the editor can
show field names, descriptions, and basic mistakes while you type.

For DialogForge itself, add this to `.vscode/settings.json`:

```json
{
    "json.schemas": [
        {
            "fileMatch": ["shared/base-app/dialogs/**/dialog.json"],
            "url": "./schemas/dialog.schema.json"
        }
    ]
}
```

For a sibling product repository next to DialogForge, use:

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

If your folders are arranged differently, keep `fileMatch` the same and adjust
only the `url` so it points to DialogForge's `schemas/dialog.schema.json`.

## Linking The Dialog To A Menu

Product menu entries live in the product repository under `menu/menu.json`.
Shared menu entries live in DialogForge under `shared/base-app/menu/base-menu.json`.

Use `type: "product-dialog"` for product dialogs and `type: "shared-dialog"`
for shared dialogs.

Product dialog menu example:

```json
{
    "id": "ProductExampleDialog",
    "labelKey": "menu.root.example.dialog",
    "label": "Example dialog",
    "type": "product-dialog",
    "dialog": "exampleDialog",
    "capability": "Product.dialog.exampleDialog"
}
```

Shared dialog menu example:

```json
{
    "id": "ExampleSharedDialog",
    "labelKey": "menu.root.file.example",
    "label": "Example dialog",
    "type": "shared-dialog",
    "dialog": "exampleDialog"
}
```

Menu entries are declarative. The menu `dialog` field must match the dialog
registry `id`. The `id` field is the menu item ID, not the dialog ID.

## Product Capabilities And Runtime Prerequisites

If the menu entry has a `capability`, add that capability to the owning
`capabilities/product-capabilities.json`.

The product-facing capability entry describes the user-visible feature and any
explicit runtime prerequisites. Keep this entry in product language: the dialog
name, its label, and provider-specific prerequisites such as packages.

Use a small product-facing shape:

```json
{
    "capability": "Product.dialog.exampleDialog",
    "label": "Example dialog",
    "runtimePrerequisites": [
        {
            "provider": "r",
            "kind": "package",
            "name": ["QCA"]
        }
    ]
}
```

`runtimePrerequisites` is intentionally provider-neutral. An R product can use
`kind: "package"` for R packages. A future Python product can use the same kind
for Python packages or define a provider-specific kind if packages are not the
right concept. `name` is an array so related prerequisites can stay together.
DialogForge derives and validates its lower-level runtime requirements from the
dialog package, product metadata, and runtime provider contract. Older product
manifests may still contain `requiredRuntime` while the runtime contract is being
migrated; new dialog authoring should use the product-facing shape above.

## Labels And Translations

Menu labels should have stable `labelKey` values. Add the English/default text
in the menu entry's `label`, then add the same key to each product locale file
that product maintains.

Dialog-local text belongs inside the dialog package, usually in the `i18n`
section of `dialog.json`. Product menu text belongs in product `i18n/*.json`.
Do not put product menu text in DialogForge shared translations.

## Editing The Menu

There are two valid ways to change product menus:

1. edit `menu/menu.json` directly in the product repository;
2. use the menu customization UI in development mode, then review the resulting
   source changes before committing them.

Prefer direct JSON edits for deliberate product menu design, because they make
the diff explicit. Use the UI when you need to inspect the real menu structure
or when importing a new `.dc.zip` package into the current product.

After a menu change, check:

- the top-level menu location is appropriate for the product;
- the menu item ID is unique;
- the `dialog` field matches `dialogs/dialogs.json`;
- the `capability` field exists in `capabilities/product-capabilities.json`;
- every `labelKey` has translations in the product locale files.

## Manual Checklist

When adding a new product dialog:

1. Create or update the dialog in DialogCreator.
2. Save it as a `.dc.zip` package.
3. Start DialogForge with the product repository selected.
4. Import the `.dc.zip` package through menu customization, or unpack it
   manually into `dialogs/<provider>/<dialog-id>/`.
5. Confirm `dialogs/dialogs.json` contains the new dialog entry.
6. Add a `product-dialog` menu item to `menu/menu.json`.
7. Add or update the capability in `capabilities/product-capabilities.json`.
8. Add product menu translations in `i18n/*.json`.
9. Add or update product tests for dialog source shape, customJS behavior, and
   any product-specific external calls.
10. Run the product's normal validation command.

See the product-local `docs/adding-dialogs.md` files for concrete products (e.g.
DialogR or DialogQCA) menu locations, capability naming, and product-specific checks.

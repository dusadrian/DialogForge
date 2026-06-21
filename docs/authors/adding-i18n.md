# Adding I18n

Translations live next to the layer that owns the text.

## Shared Text

Use `shared/base-app/i18n` for common app text:

- common menus;
- shared dialogs;
- dataset editor;
- workspace;
- console;
- settings;
- help;
- generic errors.

## Product Text

Use the selected product repository's `i18n` directory for product-specific text:

- product dialogs;
- product menu additions;
- product capability messages;
- product startup/dependency messages;
- product name and about text.

## Loading Order

1. shared `en_US`
2. shared selected locale
3. product `en_US`
4. product selected locale

Product strings may override shared strings, but overrides should be intentional.

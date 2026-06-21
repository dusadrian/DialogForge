# Where Does This Code Go?

Use this guide before adding new code.

For a full walkthrough of adding a runtime provider or product, see:

- [`adding-products-and-runtime-providers.md`](adding-products-and-runtime-providers.md)

## Put Code In `shared/` When

- it belongs to the product-independent base app;
- it is language-neutral;
- it is needed by more than one product;
- it is part of a public shared contract.

## Put Code In The Product Repository When

- it is product-specific;
- it adds product dialogs, menus, translations, assets, startup behavior, or capabilities;
- it depends on product domain concepts such as QCA.

## Put Code In A Runtime Provider When

- it knows about a specific language;
- it runs commands in that language;
- it inspects that language's workspace;
- it reads or writes language-specific tabular data;
- it checks packages/modules for that language.

## Do Not

- put product behavior in shared code for convenience;
- let dialogs talk directly to IPC or DOM internals;
- check for R or Python in the base app;
- add helpers that hide unclear ownership.

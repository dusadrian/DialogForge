Dialog externals in this directory are provider-neutral and shared across products.

Use this directory for dialog external-call plumbing that is not tied to a specific
runtime provider and not owned by one product.

If a dialog external is reusable by all products and all providers, this is the home
for it.

Keep actual dialog packages in the selected product repository under dialogs/<provider>/<dialog-id>/.

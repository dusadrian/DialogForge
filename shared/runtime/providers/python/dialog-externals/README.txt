Dialog externals in this directory are shared across products, but they are Python-specific.

Use this directory for dialog external-call logic that depends on the Python provider
and can be reused by multiple products.

Keep product-specific Python externals under the selected product repository's dialog-externals/python/ when the
logic only belongs to one product.

If the logic is reusable by all products and all providers, move it under
shared/dialog-externals/.

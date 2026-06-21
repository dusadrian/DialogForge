Dialog externals in this directory are shared across products, but they are R-specific.

Use this directory for dialog external-call logic that depends on the R provider
and can be reused by multiple products.

Keep product-specific R externals under the selected product repository's dialog-externals/r/ when the
logic only belongs to one product.

If the logic is reusable by all products and all providers, move it under
shared/dialog-externals/.

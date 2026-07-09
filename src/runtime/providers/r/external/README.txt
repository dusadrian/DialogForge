Dialog external-call code in this directory is shared across products, but it is R-specific.

Use this directory for dialog external-call logic that depends on the R provider
and can be reused by multiple products.

Keep product-specific R external-call code under the selected product repository's external/r/ when the
logic only belongs to one product.

If the logic is reusable by all products and all providers, move it under
src/external/.

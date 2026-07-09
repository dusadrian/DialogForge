Dialog external-call code in this directory is shared across products, but it is Python-specific.

Use this directory for dialog external-call logic that depends on the Python provider
and can be reused by multiple products.

Keep product-specific Python external-call code under the selected product repository's external/python/ when the
logic only belongs to one product.

If the logic is reusable by all products and all providers, move it under
src/external/.

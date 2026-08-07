// Runtime provider ids are case-insensitive across the application.
//
// Dialog Creator writes the provider capitalised in dialog.json ("R"), while a
// product declares it lowercase in package.json ("r"), and the dialog importer
// lowercases it again when choosing the dialogs/<provider>/ folder. Comparing
// the two forms literally makes an imported dialog look like it targets a
// different runtime than the application it was imported into, so every
// comparison goes through here.


export const normalizeRuntimeProvider = function(value: unknown): string {
    return String(value ?? "").trim().toLowerCase();
};


export const runtimeProvidersMatch = function(
    left: unknown,
    right: unknown
): boolean {
    return normalizeRuntimeProvider(left) === normalizeRuntimeProvider(right);
};

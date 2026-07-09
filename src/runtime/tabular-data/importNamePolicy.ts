const readBasenameWithoutExtension = function(source: string): string {
    const normalized = String(source || "").replace(/\\/g, "/");
    const basename = normalized.split("/").pop() || "";

    return basename.replace(/\.[^.]*$/, "");
};


export const createImportTargetNameFromSource = function(source: string): string {
    const name = readBasenameWithoutExtension(source) || "imported_data";

    return name
        .replace(/[^A-Za-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "")
        || "imported_data";
};

export const readScriptBaseName = function(fileName: unknown): string {
    const value = String(fileName || "").replace(/\\/g, "/").trim();
    const parts = value.split("/").filter(Boolean);

    return parts[parts.length - 1] || "Untitled.R";
};

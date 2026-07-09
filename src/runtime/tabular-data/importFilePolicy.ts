export const dataFileExtensions = [
    "csv",
    "txt",
    "tsv",
    "tab",
    "dat",
    "sav",
    "zsav",
    "por",
    "dta",
    "sas7bdat",
    "xpt",
    "xls",
    "xlsx",
    "rda",
    "rdata",
    "RData",
    "rds"
];


export const createImportFileAcceptList = function(): string {
    return dataFileExtensions.map((extension) => {
        return `.${extension}`;
    }).join(",");
};


export const createImportFileExtensionSet = function(): Set<string> {
    return new Set(dataFileExtensions.map((extension) => {
        return `.${extension.toLowerCase()}`;
    }));
};


export const createSafeImportFileName = function(name: unknown): string {
    const value = String(name || "imported-data")
        .replace(/\\/g, "/")
        .split("/")
        .pop()
        ?.replace(/[^A-Za-z0-9._-]/g, "_")
        .replace(/^_+|_+$/g, "") || "";

    return value || "imported-data";
};

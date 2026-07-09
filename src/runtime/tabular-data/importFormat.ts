const extensionFormats: Record<string, string> = {
    csv: "csv",
    tsv: "tsv",
    tab: "tsv",
    dat: "text",
    txt: "text",
    xls: "excel",
    xlsx: "excel",
    sav: "spss",
    zsav: "spss",
    por: "spss",
    dta: "stata",
    sas7bdat: "sas",
    xpt: "sas",
    rda: "rdata",
    rdata: "rdata",
    rds: "rds"
};


const supportedImportFormats = new Set([
    "csv",
    "tsv",
    "text",
    "excel",
    "rds",
    "rdata",
    "spss",
    "stata",
    "sas"
]);


export const inferImportFormat = function(filePath: string): string {
    const match = String(filePath || "").toLowerCase().match(/\.([^.\/\\]+)$/);

    if (!match) {
        return "auto";
    }

    return extensionFormats[match[1]] || "auto";
};


export const isSupportedImportFormat = function(format: string): boolean {
    return supportedImportFormats.has(String(format || ""));
};


export const importFormatApi = {
    inferImportFormat,
    isSupportedImportFormat
};

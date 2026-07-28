export interface ImportPreviewRequest {
    command: string;
    file: string;
    nrows: number;
    binary: boolean;
    header: boolean;
    rowNames: number;
    sep: string;
    quote: string;
    dec: string;
    naStrings: string;
    skip: number;
    stripWhite: boolean;
    commentChar: string;
    fileEncoding: string;
    runtimeOnly: boolean;
}


export const createImportPreviewRequest = function(
    input: Partial<ImportPreviewRequest>
): ImportPreviewRequest {
    const aliases = input as Record<string, unknown>;

    return {
        command: String(input.command || ""),
        file: String(input.file || ""),
        nrows: Number.isFinite(Number(input.nrows)) ? Number(input.nrows) : 8,
        binary: input.binary === true,
        header: input.header !== false,
        rowNames: Math.max(0, Number(input.rowNames) || 0),
        sep: String(input.sep || ""),
        quote: String(input.quote ?? "\""),
        dec: String(input.dec || "."),
        naStrings: String(input.naStrings || aliases["na.strings"] || "NA"),
        skip: Math.max(0, Number(input.skip) || 0),
        stripWhite: input.stripWhite === true || aliases["strip.white"] === true,
        commentChar: String(
            input.commentChar ?? aliases["comment.char"] ?? "#"
        ),
        fileEncoding: String(input.fileEncoding || ""),
        runtimeOnly: input.runtimeOnly === true
    };
};


export const isRuntimeImportPreviewRequest = function(
    request: ImportPreviewRequest
): boolean {
    return request.runtimeOnly === true;
};


const binaryImportFormats = new Set([
    "excel",
    "sas",
    "spss",
    "stata"
]);


export const createImportPreviewRequestForFormat = function(
    input: {
        file: string;
        format: string;
        nrows?: number;
    }
): Partial<ImportPreviewRequest> {
    const format = String(input.format || "").trim().toLowerCase();
    const binary = binaryImportFormats.has(format);
    const command = binary
        ? "convert"
        : format === "tsv"
            ? "read.delim"
            : format === "rds"
                ? "readRDS"
                : "read.csv";

    const request: Partial<ImportPreviewRequest> = {
        command,
        file: String(input.file || ""),
        nrows: Math.max(1, Number(input.nrows) || 8),
        header: true,
        sep: format === "tsv" ? "\\t" : ",",
        runtimeOnly: binary || command === "readRDS"
    };

    if (binary) {
        request.binary = true;
    }

    return request;
};

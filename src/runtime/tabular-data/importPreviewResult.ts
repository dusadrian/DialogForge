import type {
    DelimitedImportOptions,
    DelimitedImportTable
} from "./delimitedImport";


export interface ImportPreviewResult {
    status: string;
    error: string;
    colnames: string[];
    vdata: unknown[][];
}


export interface ImportPreviewDelimitedOptionsInput {
    command?: unknown;
    header?: unknown;
    nrows?: unknown;
    sep?: unknown;
    quote?: unknown;
    skip?: unknown;
    stripWhite?: unknown;
    "strip.white"?: unknown;
    commentChar?: unknown;
    "comment.char"?: unknown;
}


export const createImportPreviewResult = function(
    input: Partial<ImportPreviewResult>
): ImportPreviewResult {
    return {
        status: String(input.status || "ready"),
        error: String(input.error || ""),
        colnames: Array.isArray(input.colnames) ? input.colnames.map(String) : [],
        vdata: Array.isArray(input.vdata) ? input.vdata : []
    };
};


export const createDelimitedImportPreviewOptions = function(
    input: ImportPreviewDelimitedOptionsInput
): DelimitedImportOptions {
    const separator = input.command === "read.delim" || input.sep === "\\t" || input.sep === "\t"
        ? "\t"
        : input.sep === " "
            ? " "
            : String(input.sep || ",");

    return {
        header: input.header !== false,
        nrows: Math.max(1, Number(input.nrows) || 8),
        separator,
        quote: String(input.quote ?? "\""),
        skip: Math.max(0, Number(input.skip) || 0),
        commentChar: String(input.commentChar ?? input["comment.char"] ?? "#"),
        stripWhite: input.stripWhite === true || input["strip.white"] === true
    };
};


export const createImportPreviewResultFromDelimitedTable = function(
    table: DelimitedImportTable
): ImportPreviewResult {
    const vdata = table.columns.map((column) => {
        return table.rows.map((row) => {
            return row[column] ?? "";
        });
    });

    return createImportPreviewResult({
        status: "ready",
        error: "",
        colnames: table.columns,
        vdata
    });
};


export const createImportPreviewFailureResult = function(
    error: unknown,
    status = "failed"
): ImportPreviewResult {
    return createImportPreviewResult({
        status,
        error: error instanceof Error ? error.message : String(error),
        colnames: [],
        vdata: []
    });
};


export const createImportPreviewNotFoundResult = function(
    error = "Import source does not exist."
): ImportPreviewResult {
    return createImportPreviewResult({
        status: "not-found",
        error,
        colnames: [],
        vdata: []
    });
};


export const createImportPreviewUnsupportedResult = function(
    error = "Preview for this file type is not available yet."
): ImportPreviewResult {
    return createImportPreviewResult({
        status: "unsupported",
        error,
        colnames: [],
        vdata: []
    });
};


export const createImportPreviewResultFromRuntimeValue = function(
    value: unknown,
    error: string
): ImportPreviewResult {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        const result = value as Partial<ImportPreviewResult>;

        return createImportPreviewResult({
            status: result.status,
            error: result.error,
            colnames: result.colnames,
            vdata: Array.isArray(result.vdata)
                ? result.vdata.map((column) => {
                    return Array.isArray(column) ? column.map(String) : [];
                })
                : []
        });
    }

    return createImportPreviewResult({
        status: "failed",
        error
    });
};


export const createImportPreviewResultFromRuntimeJsonText = function(
    value: unknown,
    error = "Runtime returned an invalid import preview."
): ImportPreviewResult {
    try {
        return createImportPreviewResultFromRuntimeValue(
            JSON.parse(String(value || "").trim()),
            error
        );
    }
    catch (caught) {
        return createImportPreviewFailureResult(caught, "error");
    }
};

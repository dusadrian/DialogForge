import type {
    ImportPreviewRequest
} from "../../../tabular-data/importPreview";


export type RImportPreviewReader =
    | "convert"
    | "readRDS";


export const createRImportPreviewRequest = function(
    input: {
        file: string;
        format: string;
        nrows?: number;
    }
): Partial<ImportPreviewRequest> {
    const normalizedFormat = String(input.format || "").trim().toLowerCase();
    const command = normalizedFormat === "tsv"
        ? "read.delim"
        : normalizedFormat === "rds"
            ? "readRDS"
            : "read.csv";

    return {
        command,
        file: String(input.file || ""),
        nrows: Math.max(1, Number(input.nrows) || 8),
        header: true,
        sep: normalizedFormat === "tsv" ? "\\t" : ",",
        runtimeOnly: command === "readRDS"
    };
};


const rJsonLiteral = function(value: unknown): string {
    return JSON.stringify(String(value ?? ""));
};


const createReadDataFrameLines = function(reader: RImportPreviewReader): string[] {
    if (reader === "convert") {
        return [
            "  if (!requireNamespace(\"DDIwR\", quietly = TRUE)) stop(\"DDIwR is required to preview this file type.\")",
            "  .df <- as.data.frame(suppressWarnings(suppressMessages(DDIwR::convert(.file, n_max = .nrows))))"
        ];
    }

    return [
        "  .object <- readRDS(.file)",
        "  .df <- as.data.frame(.object)"
    ];
};


export const resolveRImportPreviewReader = function(
    request: Partial<ImportPreviewRequest>
): RImportPreviewReader | null {
    if (request.binary || request.command === "convert") {
        return "convert";
    }

    if (request.command === "readRDS") {
        return "readRDS";
    }

    return null;
};


export const createRImportPreviewCommand = function(
    filePath: unknown,
    nrows: unknown,
    reader: RImportPreviewReader
): string {
    return [
        "local({",
        `  .file <- ${rJsonLiteral(filePath)}`,
        `  .nrows <- ${JSON.stringify(Math.max(1, Number(nrows) || 8))}`,
        "  if (!requireNamespace(\"jsonlite\", quietly = TRUE)) stop(\"jsonlite is required to preview this file type.\")",
        ...createReadDataFrameLines(reader),
        "  .rows <- utils::head(.df, .nrows)",
        "  .vdata <- lapply(.rows, function(.column) as.character(.column))",
        "  cat(jsonlite::toJSON(list(",
        "    status = \"ready\",",
        "    error = \"\",",
        "    colnames = names(.rows),",
        "    vdata = unname(.vdata)",
        "  ), auto_unbox = TRUE, null = \"null\", na = \"string\"))",
        "})"
    ].join("\n");
};

import type { ImportRequest } from "../../../provider-contract/runtimeProvider";
import { rString } from "../commands/rLiteral";


const isDDIwRImportFormat = function(format: string): boolean {
    return ["excel", "spss", "stata", "sas"].includes(
        String(format || "")
    );
};


const readerForFormat = function(
    format: string
): {
    reader: string;
    sep: string;
} {
    if (format === "rds") {
        return {
            reader: "base::readRDS",
            sep: ""
        };
    }

    if (format === "csv") {
        return {
            reader: "utils::read.csv",
            sep: ","
        };
    }

    if (format === "tsv") {
        return {
            reader: "utils::read.delim",
            sep: "\\t"
        };
    }

    return {
        reader: "utils::read.table",
        sep: ""
    };
};


export const supportsRImportFormat = function(format: string): boolean {
    return [
        "csv",
        "tsv",
        "text",
        "excel",
        "rds",
        "rdata",
        "spss",
        "stata",
        "sas"
    ].includes(String(format || ""));
};


const createRDataImportCommand = function(
    request: ImportRequest,
    targetName: string
): string {
    return [
        "local({",
        `    .target <- ${rString(targetName)}`,
        `    .source <- ${rString(request.source)}`,
        `    if (exists(.target, envir = .GlobalEnv, inherits = FALSE) && !${request.overwrite ? "TRUE" : "FALSE"}) stop("import-target-exists")`,
        "    .env <- new.env(parent = emptyenv())",
        "    .names <- load(.source, envir = .env)",
        "    .pick <- if (is.element(.target, .names)) .target else character(0)",
        "    if (!length(.pick)) {",
        "        .pick <- .names[vapply(.names, function(.name) {",
        "            .value <- get(.name, envir = .env, inherits = FALSE)",
        "            is.data.frame(.value) || is.matrix(.value)",
        "        }, logical(1))]",
        "    }",
        "    if (!length(.pick) && length(.names)) .pick <- .names[[1]]",
        "    if (!length(.pick)) stop(\"rdata-import-empty\")",
        "    .data <- get(.pick[[1]], envir = .env, inherits = FALSE)",
        "    assign(.target, as.data.frame(.data, stringsAsFactors = FALSE, check.names = FALSE), envir = .GlobalEnv)",
        "    invisible(get(.target, envir = .GlobalEnv, inherits = FALSE))",
        "})"
    ].join("\n");
};


const createTabularFileImportCommand = function(
    request: ImportRequest,
    targetName: string
): string {
    const reader = readerForFormat(request.format);
    const readLine = reader.reader === "base::readRDS"
        ? `    .data <- ${reader.reader}(.source)`
        : `    .data <- ${reader.reader}(file = .source, header = TRUE, stringsAsFactors = FALSE, check.names = FALSE${reader.sep ? `, sep = ${rString(reader.sep)}` : ""})`;

    return [
        "local({",
        `    .target <- ${rString(targetName)}`,
        `    .source <- ${rString(request.source)}`,
        `    if (exists(.target, envir = .GlobalEnv, inherits = FALSE) && !${request.overwrite ? "TRUE" : "FALSE"}) stop("import-target-exists")`,
        readLine,
        "    assign(.target, as.data.frame(.data, stringsAsFactors = FALSE, check.names = FALSE), envir = .GlobalEnv)",
        "    invisible(get(.target, envir = .GlobalEnv, inherits = FALSE))",
        "})"
    ].join("\n");
};


const createDDIwRImportCommand = function(
    request: ImportRequest,
    targetName: string
): string {
    return [
        "local({",
        `    .target <- ${rString(targetName)}`,
        `    .source <- ${rString(request.source)}`,
        `    if (exists(.target, envir = .GlobalEnv, inherits = FALSE) && !${request.overwrite ? "TRUE" : "FALSE"}) stop("import-target-exists")`,
        "    if (!requireNamespace(\"DDIwR\", quietly = TRUE)) stop(\"missing-package: DDIwR\")",
        "    .data <- DDIwR::convert(from = .source, to = NULL, declared = FALSE)",
        "    assign(.target, as.data.frame(.data, stringsAsFactors = FALSE, check.names = FALSE), envir = .GlobalEnv)",
        "    invisible(get(.target, envir = .GlobalEnv, inherits = FALSE))",
        "})"
    ].join("\n");
};


export const createVisibleImportCommand = function(
    request: ImportRequest,
    targetName: string
): string {
    if (request.format === "rdata") {
        return createRDataImportCommand(request, targetName);
    }

    if (isDDIwRImportFormat(request.format)) {
        return createDDIwRImportCommand(request, targetName);
    }

    return createTabularFileImportCommand(request, targetName);
};

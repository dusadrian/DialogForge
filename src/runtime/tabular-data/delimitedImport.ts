export interface DelimitedImportTable {
    columns: string[];
    rows: Record<string, unknown>[];
}


export interface DelimitedImportOptions {
    header?: boolean;
    nrows?: number;
    separator?: string;
    quote?: string;
    skip?: number;
    stripWhite?: boolean;
    commentChar?: string;
}


const splitDelimitedLine = function(line: string, separator: string, quoteCharacter: string): string[] {
    const fields: string[] = [];
    let current = "";
    let quoted = false;

    for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        const next = line[index + 1];

        if (quoteCharacter && character === quoteCharacter) {
            if (quoted && next === quoteCharacter) {
                current += quoteCharacter;
                index += 1;
            } else {
                quoted = !quoted;
            }
        } else if (character === separator && !quoted) {
            fields.push(current);
            current = "";
        } else {
            current += character;
        }
    }

    fields.push(current);

    return fields;
};


const chooseSeparator = function(format: string, text: string): string {
    if (format === "tsv") {
        return "\t";
    }
    if (format === "text") {
        const firstLine = text.split(/\r?\n/, 1)[0] || "";
        return firstLine.includes("\t") ? "\t" : ",";
    }
    return ",";
};


const cleanColumnName = function(value: string, index: number): string {
    const name = String(value || "").trim();

    return name || "column_" + String(index + 1);
};


export const parseDelimitedTable = function(
    text: string,
    format: string,
    options: DelimitedImportOptions = {}
): DelimitedImportTable {
    const separator = options.separator || chooseSeparator(format, text);
    const quoteCharacter = String(options.quote ?? "\"").charAt(0);
    const commentChar = String(options.commentChar ?? "#");
    const skip = Math.max(0, Number(options.skip) || 0);
    const lines = String(text || "").split(/\r?\n/).slice(skip).filter((line) => {
        if (commentChar && line.trimStart().startsWith(commentChar)) {
            return false;
        }

        return line.length > 0;
    });

    if (lines.length === 0) {
        return {
            columns: [],
            rows: []
        };
    }

    const header = options.header !== false;
    const firstFields = splitDelimitedLine(lines[0], separator, quoteCharacter);
    const columns = header
        ? firstFields.map((field, index) => {
            return cleanColumnName(options.stripWhite ? field.trim() : field, index);
        })
        : firstFields.map((_field, index) => {
            return "column_" + String(index + 1);
        });
    const dataLines = header ? lines.slice(1) : lines;
    const selectedLines = typeof options.nrows === "number" && options.nrows >= 0
        ? dataLines.slice(0, options.nrows)
        : dataLines;
    const rows = selectedLines.map((line) => {
        const fields = splitDelimitedLine(line, separator, quoteCharacter);
        const row: Record<string, unknown> = {};

        columns.forEach((column, index) => {
            const value = fields[index] ?? "";

            row[column] = options.stripWhite ? String(value).trim() : value;
        });

        return row;
    });

    return {
        columns,
        rows
    };
};

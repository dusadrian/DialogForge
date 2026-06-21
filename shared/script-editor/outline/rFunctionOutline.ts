export interface ScriptFunctionSymbol {
    name: string;
    lineNumber: number;
    column: number;
    detail: string;
}


export interface ScriptTextModelReader {
    getLineCount(): number;
    getLineContent(lineNumber: number): string;
}


const stripRComment = function(line: string): string {
    let quote = "";
    let escaped = false;

    for (let index = 0; index < line.length; index += 1) {
        const character = line[index];

        if (escaped) {
            escaped = false;
            continue;
        }

        if (quote) {
            if (character === "\\") {
                escaped = true;
            } else if (character === quote) {
                quote = "";
            }

            continue;
        }

        if (character === '"' || character === "'") {
            quote = character;
            continue;
        }

        if (character === "#") return line.slice(0, index);
    }

    return line;
};


const normalizeRFunctionName = function(name: string): string {
    const value = String(name || "").trim();

    if (value.startsWith("`") && value.endsWith("`") && value.length >= 2) {
        return value.slice(1, -1);
    }

    return value;
};


export const parseRFunctionOutline = function(
    model: ScriptTextModelReader
): ScriptFunctionSymbol[] {
    const lineCount = Math.max(1, Number(model.getLineCount()) || 1);
    const symbols: ScriptFunctionSymbol[] = [];
    const assignmentPattern = /^\s*(`[^`]+`|[A-Za-z.][A-Za-z0-9._]*)\s*(?:<-|=|<<-)\s*(.*)$/;
    const directFunctionPattern = /^(?:base::)?(?:function\s*\(|\\\s*\()/;
    let previousAssignment: {
        name: string;
        lineNumber: number;
        column: number;
    } | null = null;

    for (let lineNumber = 1; lineNumber <= lineCount; lineNumber += 1) {
        const rawLine = String(model.getLineContent(lineNumber) || "");
        const line = stripRComment(rawLine);
        const trimmed = line.trim();

        if (!trimmed) {
            previousAssignment = null;
            continue;
        }

        const assignmentMatch = line.match(assignmentPattern);

        if (assignmentMatch) {
            const rawName = assignmentMatch[1];
            const rightHandSide = String(assignmentMatch[2] || "").trim();
            const column = Math.max(1, rawLine.indexOf(rawName) + 1);

            if (directFunctionPattern.test(rightHandSide)) {
                symbols.push({
                    name: normalizeRFunctionName(rawName),
                    lineNumber,
                    column,
                    detail: `line ${lineNumber}`
                });
                previousAssignment = null;
                continue;
            }

            previousAssignment = {
                name: normalizeRFunctionName(rawName),
                lineNumber,
                column
            };
            continue;
        }

        if (previousAssignment && directFunctionPattern.test(trimmed)) {
            symbols.push({
                name: previousAssignment.name,
                lineNumber: previousAssignment.lineNumber,
                column: previousAssignment.column,
                detail: `line ${previousAssignment.lineNumber}`
            });
        }

        previousAssignment = null;
    }

    return symbols;
};

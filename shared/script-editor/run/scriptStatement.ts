export type ScriptFragmentState =
    | "complete"
    | "incomplete"
    | "invalid"
    | "unknown";


export interface ScriptStatementModel {
    getLineCount(): number;
    getLineContent(lineNumber: number): string;
    getText(startLine: number, endLine: number): string;
}


export interface ScriptStatement {
    startLine: number;
    endLine: number;
    code: string;
}


const LONG_BLOCK_FRAGMENT_SCAN_THRESHOLD = 24;


const lineIsBlank = function(
    model: ScriptStatementModel,
    lineNumber: number
): boolean {
    return String(model.getLineContent(lineNumber) || "").trim().length === 0;
};


const nearestNonblankLine = function(
    model: ScriptStatementModel,
    requestedLine: number
): number {
    const lineCount = Math.max(1, Number(model.getLineCount()) || 1);
    let lineNumber = Math.max(1, Math.min(lineCount, Number(requestedLine) || 1));

    if (!lineIsBlank(model, lineNumber)) return lineNumber;

    for (let nextLine = lineNumber + 1; nextLine <= lineCount; nextLine += 1) {
        if (!lineIsBlank(model, nextLine)) return nextLine;
    }

    for (let previousLine = lineNumber - 1; previousLine >= 1; previousLine -= 1) {
        if (!lineIsBlank(model, previousLine)) return previousLine;
    }

    return lineNumber;
};


export const findScriptStatementAtLine = async function(
    model: ScriptStatementModel,
    requestedLine: number,
    checkFragment: (code: string) => Promise<ScriptFragmentState>
): Promise<ScriptStatement> {
    const lineCount = Math.max(1, Number(model.getLineCount()) || 1);
    const anchor = nearestNonblankLine(model, requestedLine);

    if (lineIsBlank(model, anchor)) {
        return {
            startLine: anchor,
            endLine: anchor,
            code: ""
        };
    }

    let blockStart = anchor;

    while (blockStart > 1 && !lineIsBlank(model, blockStart - 1)) {
        blockStart -= 1;
    }

    let blockEnd = anchor;

    while (blockEnd < lineCount && !lineIsBlank(model, blockEnd + 1)) {
        blockEnd += 1;
    }

    if (blockEnd - blockStart + 1 >= LONG_BLOCK_FRAGMENT_SCAN_THRESHOLD) {
        const blockCode = String(model.getText(blockStart, blockEnd) || "");
        const state = await checkFragment(blockCode);

        if (state === "complete" || state === "unknown") {
            return {
                startLine: blockStart,
                endLine: blockEnd,
                code: blockCode
            };
        }
    }

    for (let span = 0; span <= blockEnd - blockStart; span += 1) {
        const minimumStart = Math.max(blockStart, anchor - span);
        const maximumStart = Math.min(anchor, blockEnd - span);

        for (
            let candidateStart = maximumStart;
            candidateStart >= minimumStart;
            candidateStart -= 1
        ) {
            const candidateEnd = candidateStart + span;
            const code = String(model.getText(candidateStart, candidateEnd) || "");

            if (!code.trim()) continue;

            const state = await checkFragment(code);

            if (state === "complete" || state === "unknown") {
                return {
                    startLine: candidateStart,
                    endLine: candidateEnd,
                    code
                };
            }
        }
    }

    return {
        startLine: blockStart,
        endLine: blockEnd,
        code: String(model.getText(blockStart, blockEnd) || "")
    };
};

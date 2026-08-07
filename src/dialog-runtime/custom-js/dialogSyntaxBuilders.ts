// Syntax-building helpers for dialog scripts, mirroring the Dialog Creator API.
//
// These describe the *shape* of a generated command and work the indentation
// out from the actual nesting depth, so a dialog script never contains
// hand-written line breaks or runs of spaces. They only arrange whitespace,
// which keeps them provider-neutral: an R, Python, or Julia command nests the
// same way.


export type DialogSyntaxPart =
    | string
    | number
    | null
    | undefined
    | ReadonlyArray<string | number | null | undefined>;


const INDENT_UNIT = "  ";


// Shift every non-blank line right. Blank lines are left alone so the result
// never carries trailing whitespace.
export const indentDialogSyntax = function(
    text: string,
    levels: number
): string {
    if (levels <= 0) {
        return text;
    }

    const padding = INDENT_UNIT.repeat(levels);

    return text
        .split("\n")
        .map((line) => {
            return line.trim().length
                ? padding + line
                : line;
        })
        .join("\n");
};


// Accept both call("f", [a, b]) and call("f", a, b), and drop the parts that
// carry nothing, so a dialog can push optional arguments unconditionally.
const collectSyntaxParts = function(parts: DialogSyntaxPart[]): string[] {
    const flattened: Array<string | number | null | undefined> = [];

    parts.forEach((part) => {
        if (Array.isArray(part)) {
            flattened.push(...part);
        }
        else {
            flattened.push(part as string | number | null | undefined);
        }
    });

    const collected: string[] = [];

    flattened.forEach((part) => {
        if (part === null || part === undefined) {
            return;
        }

        const text = String(part);

        if (text.trim().length) {
            collected.push(text);
        }
    });

    return collected;
};


export const renderDialogSyntaxCall = function(
    name: unknown,
    parts: DialogSyntaxPart[]
): string {
    const callName = String(name ?? "").trim();

    if (!callName) {
        throw new SyntaxError("call() expects a function name");
    }

    const args = collectSyntaxParts(parts);

    if (!args.length) {
        return callName + "()";
    }

    const body = args
        .map((argument) => indentDialogSyntax(argument, 1))
        .join(",\n");

    return callName + "(\n" + body + "\n)";
};


export const renderDialogSyntaxBlock = function(
    parts: DialogSyntaxPart[]
): string {
    const statements = collectSyntaxParts(parts);

    if (!statements.length) {
        return "{}";
    }

    const body = statements
        .map((statement) => indentDialogSyntax(statement, 1))
        .join("\n");

    return "{\n" + body + "\n}";
};


export const renderDialogSyntaxIndent = function(
    text: unknown,
    levels: unknown
): string {
    const steps = levels === undefined
        ? 1
        : Math.trunc(Number(levels));

    if (!Number.isFinite(steps)) {
        throw new SyntaxError("indent() expects a number of levels");
    }

    return indentDialogSyntax(String(text ?? ""), steps);
};


export const dialogSyntaxBuilders = {
    call: renderDialogSyntaxCall,
    block: renderDialogSyntaxBlock,
    indent: renderDialogSyntaxIndent
};

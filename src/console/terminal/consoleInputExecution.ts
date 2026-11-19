export type ConsoleFragmentState =
    | "complete"
    | "incomplete"
    | "invalid"
    | "unknown";


export type ConsoleInputExecutionPlan =
    | {
        chunks: string[];
        incomplete: false;
        remainder: "";
    }
    | {
        chunks: string[];
        incomplete: true;
        remainder: string;
    };


const canRunSingleLineImmediately = function(source: string): boolean {
    const trimmed = source.trim();

    if (!trimmed || source.includes("\n")) {
        return false;
    }

    const endsWithOperator =
        /(?:<-|<<-|=|\+|-|\*|\/|\^|,|::|:::|\$|@|~|:|\||&)\s*$/
            .test(trimmed);
    const delimiterCounts = {
        openParenthesis: (source.match(/\(/g) || []).length,
        closeParenthesis: (source.match(/\)/g) || []).length,
        openBrace: (source.match(/\{/g) || []).length,
        closeBrace: (source.match(/\}/g) || []).length,
        openBracket: (source.match(/\[/g) || []).length,
        closeBracket: (source.match(/\]/g) || []).length
    };
    const doubleQuoteCount =
        (source.match(/(?<!\\)"/g) || []).length;
    const singleQuoteCount =
        (source.match(/(?<!\\)'/g) || []).length;
    const balancedDelimiters =
        delimiterCounts.openParenthesis
            === delimiterCounts.closeParenthesis
        && delimiterCounts.openBrace
            === delimiterCounts.closeBrace
        && delimiterCounts.openBracket
            === delimiterCounts.closeBracket;
    const balancedQuotes =
        doubleQuoteCount % 2 === 0
        && singleQuoteCount % 2 === 0;

    return !endsWithOperator
        && balancedDelimiters
        && balancedQuotes;
};


export interface RuntimeConsoleInputPlan {
    state: ConsoleFragmentState;
    plan: ConsoleInputExecutionPlan;
}


export const readRuntimeConsoleInputPlan = function(code: string, value: unknown): RuntimeConsoleInputPlan {
    const result = value as { state?: ConsoleFragmentState; ends?: number[] } | null;
    if (!result || !Array.isArray(result.ends) || !result.state
        || !["complete", "invalid", "incomplete"].includes(result.state)) {
        throw new Error("Runtime could not plan console input.");
    }
    const lines = code.split("\n");
    const chunks: string[] = [];
    let first = 0;

    const skipBlankLines = function(): void {
        while (first < lines.length && !lines[first].trim()) {
            first++;
        }
    };
    for (const end of result.ends) {
        skipBlankLines();
        if (!Number.isSafeInteger(end) || end <= first || end > lines.length) {
            throw new Error("Runtime returned an invalid console input range.");
        }
        chunks.push(lines.slice(first, end).join("\n"));
        first = end;
    }
    skipBlankLines();
    return {
        state: result.state,
        plan: first < lines.length
            ? { chunks, incomplete: true, remainder: lines.slice(first).join("\n") + "\n" }
            : { chunks, incomplete: false, remainder: "" }
    };
};


export const planConsoleInputExecution = async function(
    code: string,
    checkFragment: (
        code: string
    ) => Promise<ConsoleFragmentState>,
    planMultiline?: (code: string) => Promise<ConsoleInputExecutionPlan>
): Promise<ConsoleInputExecutionPlan> {
    const source = String(code || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");

    if (canRunSingleLineImmediately(source)) {
        return {
            chunks: [source],
            incomplete: false,
            remainder: ""
        };
    }

    if (source.includes("\n") && planMultiline) {
        return planMultiline(source);
    }

    const chunks: string[] = [];
    let pending = "";

    for (const sourceLine of source.split("\n")) {
        const line = String(sourceLine || "");

        if (!pending && !line.trim()) {
            continue;
        }

        pending = pending
            ? `${pending}\n${line}`
            : line;

        const state = await checkFragment(pending);

        if (state === "incomplete") {
            continue;
        }

        if (pending.trim()) {
            chunks.push(pending);
        }

        pending = "";
    }

    if (pending.trim()) {
        const state = await checkFragment(pending);

        if (state === "incomplete") {
            return {
                chunks,
                incomplete: true,
                remainder: `${pending}\n`
            };
        }

        chunks.push(pending);
    }

    return {
        chunks,
        incomplete: false,
        remainder: ""
    };
};

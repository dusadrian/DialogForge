import { CompletionContext } from "./completionTypes";

const DATA_MASKING_FUNCTIONS = new Set(["using", "with", "inside"]);

const completionToken = function(source: string): string {
    const match = source.match(/([A-Za-z._][A-Za-z0-9._]*)$/);

    return match ? String(match[1] || "") : "";
};

const functionNameBeforeParenthesis = function(
    source: string,
    parenthesisIndex: number
): string {
    let index = parenthesisIndex - 1;

    while (index >= 0 && /\s/.test(source[index] || "")) {
        index -= 1;
    }

    const end = index + 1;

    while (index >= 0 && /[A-Za-z0-9._]/.test(source[index] || "")) {
        index -= 1;
    }

    const name = source.slice(index + 1, end);

    return /^[A-Za-z.][A-Za-z0-9._]*$/.test(name) ? name : "";
};

const firstTopLevelComma = function(source: string): number {
    let quote = "";
    let escaped = false;
    let depth = 0;

    for (let index = 0; index < source.length; index += 1) {
        const character = source[index];

        if (escaped) {
            escaped = false;
            continue;
        }

        if (character === "\\") {
            escaped = true;
            continue;
        }

        if (quote) {
            if (character === quote) {
                quote = "";
            }

            continue;
        }

        if (character === "\"" || character === "'") {
            quote = character;
            continue;
        }

        if (character === "(" || character === "[" || character === "{") {
            depth += 1;
            continue;
        }

        if (character === ")" || character === "]" || character === "}") {
            depth = Math.max(0, depth - 1);
            continue;
        }

        if (character === "," && depth === 0) {
            return index;
        }
    }

    return -1;
};

const isDataMaskVariablePosition = function(
    functionName: string,
    body: string,
    firstComma: number
): boolean {
    if (functionName === "with" || functionName === "inside") {
        return true;
    }

    const tail = body.slice(firstComma + 1);
    let quote = "";
    let escaped = false;
    let depth = 0;
    let lastTopLevelComma = -1;
    let topLevelEqualsAfterLastComma = false;

    for (let index = 0; index < tail.length; index += 1) {
        const character = tail[index];

        if (escaped) {
            escaped = false;
            continue;
        }

        if (character === "\\") {
            escaped = true;
            continue;
        }

        if (quote) {
            if (character === quote) {
                quote = "";
            }

            continue;
        }

        if (character === "\"" || character === "'") {
            quote = character;
            continue;
        }

        if (character === "(" || character === "[" || character === "{") {
            depth += 1;
            continue;
        }

        if (character === ")" || character === "]" || character === "}") {
            depth = Math.max(0, depth - 1);
            continue;
        }

        if (depth === 0 && character === ",") {
            lastTopLevelComma = index;
            topLevelEqualsAfterLastComma = false;
            continue;
        }

        if (
            depth === 0
            && character === "="
            && index > lastTopLevelComma
        ) {
            topLevelEqualsAfterLastComma = true;
        }
    }

    return depth > 0 || topLevelEqualsAfterLastComma;
};

const dataMaskContext = function(source: string): CompletionContext | null {
    const stack: Array<{ name: string; openIndex: number }> = [];
    let quote = "";
    let escaped = false;

    for (let index = 0; index < source.length; index += 1) {
        const character = source[index];

        if (escaped) {
            escaped = false;
            continue;
        }

        if (character === "\\") {
            escaped = true;
            continue;
        }

        if (quote) {
            if (character === quote) {
                quote = "";
            }

            continue;
        }

        if (character === "\"" || character === "'") {
            quote = character;
            continue;
        }

        if (character === "(") {
            stack.push({
                name: functionNameBeforeParenthesis(source, index),
                openIndex: index
            });
            continue;
        }

        if (character === ")") {
            stack.pop();
        }
    }

    for (let index = stack.length - 1; index >= 0; index -= 1) {
        const frame = stack[index];

        if (!DATA_MASKING_FUNCTIONS.has(frame.name)) {
            continue;
        }

        const body = source.slice(frame.openIndex + 1);
        const comma = firstTopLevelComma(body);

        if (comma < 0 || !isDataMaskVariablePosition(frame.name, body, comma)) {
            return null;
        }

        const dataset = body.slice(0, comma).trim();

        if (!/^[A-Za-z.][A-Za-z0-9._]*(?:\$[A-Za-z.][A-Za-z0-9._]*)*$/.test(dataset)) {
            return null;
        }

        const token = completionToken(source);

        if (!token) {
            return null;
        }

        return {
            mode: "data-mask-variable",
            fn: frame.name,
            dataset,
            token
        };
    }

    return null;
};

const openStringContext = function(source: string): CompletionContext | null {
    let quote = "";
    let quoteStart = -1;
    let escaped = false;

    for (let index = 0; index < source.length; index += 1) {
        const character = source[index];

        if (escaped) {
            escaped = false;
            continue;
        }

        if (character === "\\") {
            escaped = true;
            continue;
        }

        if (!quote) {
            if (character === "\"" || character === "'") {
                quote = character;
                quoteStart = index;
            }

            continue;
        }

        if (character === quote) {
            quote = "";
            quoteStart = -1;
        }
    }

    if (!quote || quoteStart < 0) {
        return null;
    }

    const stringContent = source.slice(quoteStart + 1);
    const lastSlash = Math.max(
        stringContent.lastIndexOf("/"),
        stringContent.lastIndexOf("\\")
    );
    const token = lastSlash >= 0
        ? stringContent.slice(lastSlash + 1)
        : stringContent;

    return {
        mode: "path",
        token,
        quote,
        stringContent,
        replaceText: stringContent
    };
};

export const getCompletionContext = function(line: string): CompletionContext | null {
    const source = String(line || "");
    const stringContext = openStringContext(source);

    if (stringContext) {
        return stringContext;
    }

    const internalNamespace = source.match(
        /(?:^|[^A-Za-z0-9._:])([A-Za-z.][A-Za-z0-9._]*):::([A-Za-z0-9._]*)$/
    );

    if (internalNamespace) {
        return {
            mode: "namespace-internal",
            ns: String(internalNamespace[1] || ""),
            token: String(internalNamespace[2] || "")
        };
    }

    const namespace = source.match(
        /(?:^|[^A-Za-z0-9._:])([A-Za-z.][A-Za-z0-9._]*)::([A-Za-z0-9._]*)$/
    );

    if (namespace) {
        return {
            mode: "namespace",
            ns: String(namespace[1] || ""),
            token: String(namespace[2] || "")
        };
    }

    const member = source.match(
        /(?:^|[^A-Za-z0-9._$])([A-Za-z.][A-Za-z0-9._]*(?:\$[A-Za-z.][A-Za-z0-9._]*)*)\$([A-Za-z0-9._]*)$/
    );

    if (member) {
        const chain = String(member[1] || "");
        const chainParts = chain.split("$").filter(Boolean);

        return {
            mode: "dollar",
            object: chainParts[0] || "",
            chain,
            token: String(member[2] || "")
        };
    }

    const maskedVariable = dataMaskContext(source);

    if (maskedVariable) {
        return maskedVariable;
    }

    const token = completionToken(source);

    return token
        ? { mode: "symbol", token }
        : null;
};

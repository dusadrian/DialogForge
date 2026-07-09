import { CompletionContext } from "./completionTypes";


const completionToken = function(source: string): string {
    if (/(^|[^A-Za-z0-9_.])(?:\d+\.\d*|\.\d+)$/.test(source)) {
        return "";
    }

    const match = source.match(/([A-Za-z._][A-Za-z0-9._]*)$/);

    return match ? String(match[1] || "") : "";
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

    const token = completionToken(source);

    return token
        ? { mode: "symbol", token }
        : null;
};

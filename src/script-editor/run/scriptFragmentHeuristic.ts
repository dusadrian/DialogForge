export const isLikelyIncompleteScriptFragment = function(code: unknown): boolean {
    const text = String(code || "");
    let parens = 0;
    let brackets = 0;
    let braces = 0;
    let quote = "";
    let escaped = false;

    for (const char of text) {
        if (escaped) {
            escaped = false;
            continue;
        }

        if (char === "\\") {
            escaped = true;
            continue;
        }

        if (quote) {
            if (char === quote) {
                quote = "";
            }
            continue;
        }

        if (char === "\"" || char === "'") {
            quote = char;
            continue;
        }

        if (char === "(") {
            parens += 1;
        }
        else if (char === ")") {
            parens -= 1;
        }
        else if (char === "[") {
            brackets += 1;
        }
        else if (char === "]") {
            brackets -= 1;
        }
        else if (char === "{") {
            braces += 1;
        }
        else if (char === "}") {
            braces -= 1;
        }
    }

    return Boolean(quote || parens > 0 || brackets > 0 || braces > 0);
};

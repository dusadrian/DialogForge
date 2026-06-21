export type ConsoleHelpTopicRequest = {
    query: string;
    topic: string;
    package?: string;
    allowSearch?: boolean;
};
type ContextualTopic = {
    topic: string;
    package?: string;
};


const stripOuterQuotes = function(value: string): string {
    const text = String(value || "").trim();
    const match = text.match(/^(['"`])(.*)\1$/);

    return match ? String(match[2] || "").trim() : text;
};


const normalizeTopic = function(value: string): string {
    const raw = stripOuterQuotes(String(value || "").trim());

    if (!raw) {
        return "";
    }

    if (/^(?:\[\[?|\]|\$|@|:::{0,1})$/.test(raw)) {
        return raw;
    }

    if (/^[A-Za-z.][A-Za-z0-9._]*$/.test(raw)) {
        return raw;
    }

    return "";
};


const parseCandidate = function(value: string): ContextualTopic | null {
    const raw = String(value || "").trim();

    if (!raw || raw.includes("\n")) {
        return null;
    }

    const namespaceMatch = raw.match(/^([A-Za-z.][A-Za-z0-9._]*)\s*:::{0,1}\s*(.+)$/);

    if (namespaceMatch) {
        const packageName = normalizeTopic(String(namespaceMatch[1] || ""));
        const topic = normalizeTopic(String(namespaceMatch[2] || ""));

        return packageName && topic ? { topic, package: packageName } : null;
    }

    const topic = normalizeTopic(raw);

    return topic ? { topic } : null;
};


const isIdentifierChar = function(value: string): boolean {
    return /[A-Za-z0-9._]/.test(value);
};


const isIdentifierStart = function(value: string): boolean {
    return /[A-Za-z.]/.test(value);
};


const tokenAround = function(source: string, offset: number): string {
    const text = String(source || "");
    let position = Math.max(0, Math.min(text.length, Number(offset) || 0));

    if (
        position > 0 &&
        !isIdentifierChar(text[position] || "") &&
        isIdentifierChar(text[position - 1] || "")
    ) {
        position -= 1;
    }

    if (!isIdentifierChar(text[position] || "")) {
        return "";
    }

    let start = position;
    let end = position + 1;

    while (start > 0 && isIdentifierChar(text[start - 1] || "")) {
        start -= 1;
    }

    while (end < text.length && isIdentifierChar(text[end] || "")) {
        end += 1;
    }

    return text.slice(start, end);
};


const namespaceTokenAround = function(source: string, offset: number): ContextualTopic | null {
    const text = String(source || "");
    const word = tokenAround(text, offset);

    if (!word) {
        return null;
    }

    const position = Math.max(0, Math.min(text.length, Number(offset) || 0));
    const wordStart = text.lastIndexOf(word, position);
    const start = wordStart >= 0 ? wordStart : position;
    const before = text.slice(0, start);
    const packageMatch = before.match(/([A-Za-z.][A-Za-z0-9._]*)\s*:::{0,1}\s*$/);

    if (packageMatch) {
        return {
            topic: word,
            package: String(packageMatch[1] || "")
        };
    }

    const after = text.slice(start + word.length);
    const namespaceAfter = after.match(/^\s*:::{0,1}\s*([A-Za-z.][A-Za-z0-9._]*)/);

    if (namespaceAfter && isIdentifierStart(word[0] || "")) {
        return {
            topic: String(namespaceAfter[1] || ""),
            package: word
        };
    }

    return { topic: word };
};


const lineSliceAtOffset = function(source: string, offset: number): { line: string; lineOffset: number } {
    const text = String(source || "");
    const position = Math.max(0, Math.min(text.length, Number(offset) || 0));
    const lineStart = text.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
    const nextNewline = text.indexOf("\n", position);
    const lineEnd = nextNewline >= 0 ? nextNewline : text.length;

    return {
        line: text.slice(lineStart, lineEnd),
        lineOffset: position - lineStart
    };
};


const functionCallBeforeCursor = function(source: string, offset: number): ContextualTopic | null {
    const current = lineSliceAtOffset(source, offset);
    const text = current.line.slice(0, Math.max(0, current.lineOffset));
    const parenIndex = text.lastIndexOf("(");

    if (parenIndex < 0) {
        return null;
    }

    const beforeParen = text.slice(0, parenIndex).replace(/\s+$/g, "");
    const match = beforeParen.match(/([A-Za-z.][A-Za-z0-9._]*\s*:::{0,1}\s*)?([A-Za-z.][A-Za-z0-9._]*)$/);

    if (!match) {
        return null;
    }

    const packageRaw = String(match[1] || "").replace(/:::{0,1}/, "").trim();
    const topic = normalizeTopic(String(match[2] || ""));
    const packageName = normalizeTopic(packageRaw);

    return topic ? { topic, package: packageName || undefined } : null;
};


const functionCallOnCurrentLine = function(source: string, offset: number): ContextualTopic | null {
    const current = lineSliceAtOffset(source, offset);
    const match = current.line.match(/([A-Za-z.][A-Za-z0-9._]*\s*:::{0,1}\s*)?([A-Za-z.][A-Za-z0-9._]*)\s*\(/);

    if (!match) {
        return null;
    }

    const packageRaw = String(match[1] || "").replace(/:::{0,1}/, "").trim();
    const topic = normalizeTopic(String(match[2] || ""));
    const packageName = normalizeTopic(packageRaw);

    return topic ? { topic, package: packageName || undefined } : null;
};


export const buildContextualHelpRequest = function(
    selectedText: unknown,
    source: unknown,
    offset: unknown
): ConsoleHelpTopicRequest | null {
    const selection = String(selectedText ?? "").trim();
    const fromSelection = selection ? parseCandidate(selection) : null;
    const text = String(source ?? "");
    const position = Number(offset) || 0;
    const inferred = fromSelection ||
        functionCallBeforeCursor(text, position) ||
        namespaceTokenAround(text, position) ||
        functionCallOnCurrentLine(text, position);

    if (!inferred?.topic) {
        return null;
    }

    return {
        query: selection || inferred.topic,
        topic: inferred.topic,
        package: inferred.package,
        allowSearch: true
    };
};

export interface RHelpCommandIntent {
    topic: string;
    packageName: string;
}

export const splitRTopLevelArguments = function(text: unknown): string[] {
    const args: string[] = [];
    let current = "";
    let depth = 0;
    let quote = "";
    let escaped = false;

    for (const char of String(text || "")) {
        if (escaped) {
            current += char;
            escaped = false;
            continue;
        }

        if (char === "\\") {
            current += char;
            escaped = true;
            continue;
        }

        if (quote) {
            current += char;

            if (char === quote) {
                quote = "";
            }
            continue;
        }

        if (char === "\"" || char === "'") {
            current += char;
            quote = char;
            continue;
        }

        if (char === "(" || char === "[" || char === "{") {
            current += char;
            depth += 1;
            continue;
        }

        if (char === ")" || char === "]" || char === "}") {
            current += char;
            depth -= 1;
            continue;
        }

        if (char === "," && depth === 0) {
            args.push(current.trim());
            current = "";
            continue;
        }

        current += char;
    }

    if (current.trim()) {
        args.push(current.trim());
    }

    return args;
};

export const readRQuotedPackageNames = function(value: unknown): string[] {
    const text = String(value || "").trim();
    const vector = text.match(/^c\s*\(([\s\S]*)\)$/);
    const source = vector ? vector[1] : text;
    const names: string[] = [];
    const pattern = /(["'])((?:\\.|(?!\1).)*)\1/g;
    let match: RegExpExecArray | null = null;

    while ((match = pattern.exec(source))) {
        names.push(match[2].replace(/\\(["'\\])/g, "$1"));
    }

    return names;
};

export const readRInstallPackagesCommand = function(text: unknown): string[] | null {
    const match = String(text || "").trim().match(
        /^(?:utils::)?install\.packages\s*\(([\s\S]*)\)\s*;?\s*$/
    );

    if (!match) {
        return null;
    }

    const args = splitRTopLevelArguments(match[1]);
    const firstArg = args[0] || "";
    const names = readRQuotedPackageNames(firstArg).filter(Boolean);

    return names.length ? names : null;
};


export const hasRInstallPackagesArgument = function(
    text: unknown,
    argumentName: string
): boolean {
    const match = String(text || "").trim().match(
        /^(?:utils::)?install\.packages\s*\(([\s\S]*)\)\s*;?\s*$/
    );

    if (!match) {
        return false;
    }

    const normalizedName = String(argumentName || "").trim();

    if (!normalizedName) {
        return false;
    }

    return splitRTopLevelArguments(match[1]).some((argument) => {
        return new RegExp(`^${normalizedName}\\s*=`, "i").test(argument);
    });
};

export const readRLibraryCommand = function(text: unknown): string[] | null {
    const match = String(text || "").trim().match(
        /^(?:base::)?(?:library|require)\s*\(([\s\S]*)\)\s*;?\s*$/
    );

    if (!match) {
        return null;
    }

    const args = splitRTopLevelArguments(match[1]);
    const firstArg = String(args[0] || "").trim().replace(/^package\s*=\s*/, "");
    const quoted = readRQuotedPackageNames(firstArg);
    const packageName = quoted[0]
        || firstArg.match(/^([A-Za-z.][A-Za-z0-9._]*)$/)?.[1]
        || "";

    return packageName ? [packageName] : null;
};

export const readRHelpCommand = function(text: unknown): RHelpCommandIntent | null {
    const source = String(text || "").trim();
    const questionMatch = source.match(/^\?\s*([A-Za-z.][A-Za-z0-9._]*)\s*$/);

    if (questionMatch) {
        return {
            topic: questionMatch[1],
            packageName: ""
        };
    }

    const helpMatch = source.match(/^help\s*\(\s*(?:(["'])((?:\\.|(?!\1).)*)\1|([A-Za-z.][A-Za-z0-9._]*))(?:\s*,\s*package\s*=\s*(["'])((?:\\.|(?!\5).)*)\5)?\s*\)\s*$/);

    if (!helpMatch) {
        return null;
    }

    return {
        topic: String(helpMatch[2] || helpMatch[3] || "").replace(/\\(["'\\])/g, "$1"),
        packageName: String(helpMatch[6] || "").replace(/\\(["'\\])/g, "$1")
    };
};

export const isRPlotCommand = function(text: unknown): boolean {
    const command = String(text || "");

    return /\b(?:plot|hist|boxplot|barplot|pairs|qqplot|curve|image|contour|persp)\s*\(/.test(command);
};

export const rCodeMayMutateWorkspace = function(text: unknown): boolean {
    const command = String(text || "");

    if (!command.trim()) {
        return false;
    }

    return [
        /(^|[^A-Za-z0-9_.])(?:<<-|<-)([^A-Za-z0-9_]|$)/,
        /(^|[^A-Za-z0-9_.]):=([^A-Za-z0-9_]|$)/,
        /(^|[^A-Za-z0-9_.])(?:assign|delayedAssign|rm|remove|load|source|sys\.source|set|setattr|setnames|setcolorder|setorderv|setkey|setDT|unlockBinding|lockBinding)\s*\(/,
        /(^|[^A-Za-z0-9_.])(?:data|data\.|read\.[A-Za-z0-9_.]+|write\.[A-Za-z0-9_.]+)\s*\(/
    ].some((pattern) => {
        return pattern.test(command);
    });
};

export const parseRPackageList = function(value: unknown): string[] {
    const entries = Array.isArray(value)
        ? value
        : String(value || "").split(/[;,\n]/g);

    return Array.from(new Set(entries.map((entry) => {
        return String(entry || "").trim();
    }).filter(Boolean)));
};

export const readRAssignedObjectName = function(command: unknown): string {
    const match = String(command || "").match(/^\s*([A-Za-z.][A-Za-z0-9._]*)\s*<-/);

    return match ? match[1] : "";
};

import { CompletionContext } from "./completionTypes";

const DEFAULT_TERMINAL_SYMBOLS = [
    "library", "require", "data.frame", "list", "matrix", "array", "factor",
    "as.data.frame", "head", "tail", "str", "summary", "print", "plot",
    "hist", "table", "subset", "transform", "merge", "cbind", "rbind", "lm",
    "glm", "mean", "median", "sum", "min", "max", "sd", "var", "length",
    "nrow", "ncol", "colnames", "rownames", "unique", "sort", "order",
    "sample", "setwd", "getwd", "read.csv", "write.csv", "save", "load",
    "rm", "ls"
];

const addMapValue = function(
    values: Map<string, Set<string>>,
    key: string,
    value: string
): void {
    if (!values.has(key)) {
        values.set(key, new Set<string>());
    }

    values.get(key)?.add(value);
};

const rankSuggestions = function(token: string, items: string[]): string[] {
    const prefix = String(token || "");
    const lowerPrefix = prefix.toLowerCase();
    const uniqueItems = Array.from(
        new Set(items.map((item) => String(item || "")).filter(Boolean))
    );
    const insertionOrder = new Map<string, number>();

    uniqueItems.forEach((item, index) => {
        insertionOrder.set(item, index);
    });

    return uniqueItems.sort((left, right) => {
        const leftExactCase = left.startsWith(prefix) ? 1 : 0;
        const rightExactCase = right.startsWith(prefix) ? 1 : 0;

        if (leftExactCase !== rightExactCase) {
            return rightExactCase - leftExactCase;
        }

        const leftIgnoreCase = left.toLowerCase().startsWith(lowerPrefix) ? 1 : 0;
        const rightIgnoreCase = right.toLowerCase().startsWith(lowerPrefix) ? 1 : 0;

        if (leftIgnoreCase !== rightIgnoreCase) {
            return rightIgnoreCase - leftIgnoreCase;
        }

        const leftIndex = insertionOrder.get(left) ?? 0;
        const rightIndex = insertionOrder.get(right) ?? 0;

        return leftIndex !== rightIndex
            ? leftIndex - rightIndex
            : left.localeCompare(right);
    });
};

export const requestedPackages = function(input: string): string[] {
    const source = String(input || "");

    if (!source) {
        return [];
    }

    const packages = new Set<string>();
    const pattern = /\b(?:library|require|requireNamespace)\s*\(\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z.][A-Za-z0-9._]*))/g;
    let match: RegExpExecArray | null = null;

    while ((match = pattern.exec(source)) !== null) {
        const packageName = String(
            match[1] || match[2] || match[3] || ""
        ).trim();

        if (packageName) {
            packages.add(packageName);
        }
    }

    return Array.from(packages);
};

export class CompletionKnowledge {
    private readonly knownTerminalSymbols = new Set<string>(DEFAULT_TERMINAL_SYMBOLS);
    private readonly knownPackageSymbols = new Set<string>();
    private readonly objectMembers = new Map<string, Set<string>>();
    private readonly chainMembers = new Map<string, Set<string>>();
    private readonly packageExports = new Map<string, Set<string>>();
    private readonly packageInternals = new Map<string, Set<string>>();

    public packageSymbolsMissing(packageName: string, includeInternals: boolean): boolean {
        const source = includeInternals
            ? this.packageInternals
            : this.packageExports;

        return !source.has(packageName) || source.get(packageName)?.size === 0;
    }

    public ingestPackageSymbols(
        packageName: string,
        exports: string[],
        internals: string[],
        includeInternals: boolean
    ): void {
        exports.forEach((symbol) => {
            const name = String(symbol || "").trim();

            if (name.length < 2) {
                return;
            }

            addMapValue(this.packageExports, packageName, name);
            this.knownPackageSymbols.add(name);
        });

        if (!includeInternals) {
            return;
        }

        internals.forEach((symbol) => {
            const name = String(symbol || "").trim();

            if (name.length >= 2) {
                addMapValue(this.packageInternals, packageName, name);
            }
        });
    }

    public suggestions(
        context: CompletionContext,
        packageSuggestionsEnabled: boolean,
        requestPackage: (packageName: string, includeInternals: boolean) => void
    ): string[] {
        const token = String(context.token || "").trim();

        if (context.mode === "path") {
            return [];
        }

        if (context.mode === "dollar") {
            const chain = String(context.chain || "").trim();
            const objectName = String(context.object || "").trim();
            const values = chain && chain !== objectName
                ? Array.from(this.chainMembers.get(chain) || [])
                : Array.from(this.objectMembers.get(objectName) || []);

            return rankSuggestions(
                token,
                token ? values.filter((value) => value.startsWith(token)) : values
            );
        }

        if (
            context.mode === "namespace"
            || context.mode === "namespace-internal"
        ) {
            if (!packageSuggestionsEnabled) {
                return [];
            }

            const packageName = String(context.ns || "").trim();
            const includeInternals = context.mode === "namespace-internal";

            if (
                packageName
                && this.packageSymbolsMissing(packageName, includeInternals)
            ) {
                requestPackage(packageName, includeInternals);
            }

            const source = includeInternals
                ? this.packageInternals
                : this.packageExports;
            const values = Array.from(source.get(packageName) || []);

            return rankSuggestions(
                token,
                token ? values.filter((value) => value.startsWith(token)) : values
            );
        }

        if (token.length < 2) {
            return [];
        }

        const symbols = packageSuggestionsEnabled
            ? [
                ...this.knownTerminalSymbols,
                ...this.knownPackageSymbols
            ]
            : [...this.knownTerminalSymbols];
        const bareSymbols = symbols.filter((symbol) => {
            return !symbol.includes("$") && symbol.startsWith(token);
        });
        const objectEntry = this.objectMembers.has(token)
            ? [`${token}$`]
            : [];

        return rankSuggestions(token, [...bareSymbols, ...objectEntry]);
    }

    public ingestCommand(input: string): void {
        const source = String(input || "");

        if (!source) {
            return;
        }

        this.ingestMemberChains(source);
        this.ingestNamespaceReferences(source);
        this.ingestAssignments(source);
        this.ingestListAssignment(source);
    }

    public ingestObjectNames(names: string[]): void {
        names.forEach((name) => {
            const normalized = String(name || "").trim();

            if (normalized.length >= 2) {
                this.knownTerminalSymbols.add(normalized);
            }
        });
    }

    private ingestMemberChains(source: string): void {
        const pattern = /([A-Za-z._][A-Za-z0-9._]*(?:\$[A-Za-z._][A-Za-z0-9._]*)+)/g;
        let match: RegExpExecArray | null = null;

        while ((match = pattern.exec(source)) !== null) {
            const parts = String(match[1] || "").split("$").filter(Boolean);

            if (parts.length < 2) {
                continue;
            }

            for (let index = 1; index < parts.length; index += 1) {
                const parent = parts.slice(0, index).join("$");
                const child = parts[index];

                if (!parent || !child) {
                    continue;
                }

                if (index === 1) {
                    addMapValue(this.objectMembers, parent, child);
                }

                addMapValue(this.chainMembers, parent, child);
            }

            const root = parts[0];

            if (root && root.length >= 2) {
                this.knownTerminalSymbols.add(root);
            }

            for (let index = 1; index < parts.length; index += 1) {
                const prefix = parts.slice(0, index + 1).join("$");

                if (prefix.length >= 2) {
                    this.knownTerminalSymbols.add(prefix);
                }
            }
        }
    }

    private ingestNamespaceReferences(source: string): void {
        const pattern = /([A-Za-z.][A-Za-z0-9._]*)(:::?)([A-Za-z._][A-Za-z0-9._]*)/g;
        let match: RegExpExecArray | null = null;

        while ((match = pattern.exec(source)) !== null) {
            const packageName = String(match[1] || "").trim();
            const separator = String(match[2] || "");
            const symbol = String(match[3] || "").trim();

            if (!packageName || !symbol) {
                continue;
            }

            addMapValue(
                separator === "::"
                    ? this.packageExports
                    : this.packageInternals,
                packageName,
                symbol
            );
        }
    }

    private ingestAssignments(source: string): void {
        const pattern = /(?:^|[\r\n;])\s*([A-Za-z._][A-Za-z0-9._]*)\s*<-\s*/g;
        let match: RegExpExecArray | null = null;

        while ((match = pattern.exec(source)) !== null) {
            const name = String(match[1] || "").trim();

            if (name.length >= 2) {
                this.knownTerminalSymbols.add(name);
            }
        }
    }

    private ingestListAssignment(source: string): void {
        const assignment = source.match(
            /^\s*([A-Za-z._][A-Za-z0-9._]*)\s*<-\s*list\s*\(([\s\S]*)\)\s*$/
        );

        if (!assignment) {
            return;
        }

        const root = String(assignment[1] || "").trim();
        const body = String(assignment[2] || "");

        if (!root) {
            return;
        }

        this.knownTerminalSymbols.add(root);
        this.ingestTopLevelListMembers(root, body);
        this.ingestNestedListMembers(root, body);
    }

    private ingestTopLevelListMembers(root: string, body: string): void {
        let depth = 0;
        let index = 0;

        while (index < body.length) {
            const character = body[index];

            if (character === "(") {
                depth += 1;
                index += 1;
                continue;
            }

            if (character === ")") {
                depth = Math.max(0, depth - 1);
                index += 1;
                continue;
            }

            if (depth === 0) {
                const match = body.slice(index).match(
                    /^\s*([A-Za-z._][A-Za-z0-9._]*)\s*=/
                );

                if (match) {
                    const child = String(match[1] || "").trim();

                    if (child) {
                        addMapValue(this.objectMembers, root, child);
                        this.knownTerminalSymbols.add(`${root}$${child}`);
                    }

                    index += match[0].length;
                    continue;
                }
            }

            index += 1;
        }
    }

    private ingestNestedListMembers(root: string, body: string): void {
        const nestedList = /([A-Za-z._][A-Za-z0-9._]*)\s*=\s*list\s*\(([^()]*)\)/g;
        let nestedMatch: RegExpExecArray | null = null;

        while ((nestedMatch = nestedList.exec(body)) !== null) {
            const child = String(nestedMatch[1] || "").trim();
            const nestedBody = String(nestedMatch[2] || "");

            if (!child) {
                continue;
            }

            const parentChain = `${root}$${child}`;
            const innerAssignment = /([A-Za-z._][A-Za-z0-9._]*)\s*=/g;
            let innerMatch: RegExpExecArray | null = null;

            while ((innerMatch = innerAssignment.exec(nestedBody)) !== null) {
                const inner = String(innerMatch[1] || "").trim();

                if (!inner) {
                    continue;
                }

                addMapValue(this.chainMembers, parentChain, inner);
                this.knownTerminalSymbols.add(`${parentChain}$${inner}`);
            }
        }
    }
}

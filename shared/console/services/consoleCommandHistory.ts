export interface ConsoleHistoryScope {
    productId: string;
    runtimeId: string;
}

export interface ConsoleCommandHistoryOptions {
    maximumItems?: number;
    readHistory: (scope: ConsoleHistoryScope) => Promise<unknown>;
    writeHistory: (
        scope: ConsoleHistoryScope & { history: string[] }
    ) => Promise<unknown> | void;
    registerCompletionInput?: (command: string) => void;
    excludeFromHistory?: (command: string) => boolean;
}

export interface ConsoleHistoryNavigation {
    changed: boolean;
    value: string;
}

export interface ConsoleCommandHistory {
    load: (scope: ConsoleHistoryScope) => Promise<void>;
    record: (command: string) => void;
    getInputHistory: () => string[];
    navigate: (direction: number) => ConsoleHistoryNavigation;
}

const normalizeHistoryEntry = function(value: unknown): string {
    return String(value ?? "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .trim();
};

export const createConsoleCommandHistory = function(
    options: ConsoleCommandHistoryOptions
): ConsoleCommandHistory {
    const maximumItems = Math.max(1, Number(options.maximumItems || 500));
    const newestFirst: string[] = [];
    let scope: ConsoleHistoryScope = {
        productId: "base",
        runtimeId: "none"
    };
    let navigationIndex = -1;

    const persist = function(): void {
        const oldestFirst = newestFirst
            .slice()
            .reverse()
            .slice(-maximumItems);

        void options.writeHistory({
            ...scope,
            history: oldestFirst
        });
    };

    const load = async function(nextScope: ConsoleHistoryScope): Promise<void> {
        scope = {
            productId: String(nextScope.productId || "base"),
            runtimeId: String(nextScope.runtimeId || "none")
        };

        const stored = await options.readHistory(scope);
        const storedOldestFirst = Array.isArray(stored)
            ? stored
                .map(normalizeHistoryEntry)
                .filter(Boolean)
                .slice(-maximumItems)
            : [];
        const oldestFirst = storedOldestFirst.filter((command) => {
            return !options.excludeFromHistory?.(command);
        });

        newestFirst.length = 0;
        oldestFirst
            .slice()
            .reverse()
            .forEach(function(command) {
                newestFirst.push(command);
                options.registerCompletionInput?.(command);
            });
        navigationIndex = -1;

        if (oldestFirst.length !== storedOldestFirst.length) {
            persist();
        }
    };

    const record = function(rawCommand: string): void {
        const command = normalizeHistoryEntry(rawCommand);

        if (!command) {
            return;
        }

        if (options.excludeFromHistory?.(command)) {
            return;
        }

        if (newestFirst[0] !== command) {
            newestFirst.unshift(command);
        }

        if (newestFirst.length > maximumItems) {
            newestFirst.length = maximumItems;
        }

        navigationIndex = -1;
        persist();
    };

    const navigate = function(direction: number): ConsoleHistoryNavigation {
        if (newestFirst.length === 0) {
            return {
                changed: false,
                value: ""
            };
        }

        if (direction < 0) {
            navigationIndex = Math.min(
                navigationIndex + 1,
                newestFirst.length - 1
            );
        }
        else {
            navigationIndex = Math.max(navigationIndex - 1, -1);
        }

        return {
            changed: true,
            value: navigationIndex < 0
                ? ""
                : newestFirst[navigationIndex]
        };
    };

    return {
        load,
        record,
        getInputHistory: function(): string[] {
            return newestFirst.slice().reverse();
        },
        navigate
    };
};

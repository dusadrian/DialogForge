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
    onPersistenceFailure?: (error: unknown) => void;
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

interface ConsoleHistoryLoadState {
    commands: string[];
    baseline: string[];
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
    let historyLoad = 0;
    let persistenceWrite = 0;
    let persistenceFailureReported = false;
    let historyLoading: ConsoleHistoryLoadState | null = null;
    const pendingScopeLoads = new Map<string, ConsoleHistoryLoadState>();

    const excludeFromHistory = function(command: string): boolean {
        return command.includes("__DIALOGFORGE_DATASET_READY_")
            || Boolean(options.excludeFromHistory?.(command));
    };

    const persist = function(
        historyScope = scope,
        oldestFirst = newestFirst.slice().reverse().slice(-maximumItems),
        currentScope = true
    ): void {
        const write = currentScope ? ++persistenceWrite : persistenceWrite;
        const reportFailure = function(error: unknown): void {
            if (!currentScope) {
                console.warn("Console history for an earlier scope could not be saved.");
                return;
            }
            if (write !== persistenceWrite || persistenceFailureReported) {
                return;
            }

            persistenceFailureReported = true;

            try {
                if (options.onPersistenceFailure) {
                    options.onPersistenceFailure(error);
                    return;
                }
            }
            catch {
                // A failed notice must not cancel the submitted command either.
            }

            console.warn("Console history could not be saved.", error);
        };

        try {
            const writing = options.writeHistory({
                ...historyScope,
                history: oldestFirst
            });

            void Promise.resolve(writing).then(
                function(): void {
                    if (currentScope && write === persistenceWrite) {
                        persistenceFailureReported = false;
                    }
                },
                reportFailure
            );
        }
        catch (error) {
            reportFailure(error);
        }
    };

    const mergeRecordedHistory = function(oldestFirst: string[], commands: string[]): string[] {
        const combined = oldestFirst.slice();
        for (const command of commands) {
            if (combined[combined.length - 1] !== command) {
                combined.push(command);
            }
        }

        return combined.slice(-maximumItems);
    };

    const replaceLoadedHistory = function(oldestFirst: string[], commands: string[]): void {
        newestFirst.length = 0;
        newestFirst.push(...mergeRecordedHistory(oldestFirst, commands).reverse());
        navigationIndex = -1;
    };

    const load = async function(nextScope: ConsoleHistoryScope): Promise<void> {
        const loading = ++historyLoad;
        persistenceWrite += 1;
        persistenceFailureReported = false;
        const normalizedScope = {
            productId: String(nextScope.productId || "base"),
            runtimeId: String(nextScope.runtimeId || "none")
        };
        const sameScope = scope.productId === normalizedScope.productId
            && scope.runtimeId === normalizedScope.runtimeId;
        const scopeKey = JSON.stringify([normalizedScope.productId, normalizedScope.runtimeId]);
        const previousLoad = pendingScopeLoads.get(scopeKey);
        const loadingState = {
            commands: previousLoad?.commands.slice() || [],
            baseline: previousLoad ? previousLoad.baseline.slice()
                : sameScope ? newestFirst.slice().reverse() : []
        };
        pendingScopeLoads.set(scopeKey, loadingState);
        historyLoading = loadingState;
        scope = normalizedScope;

        let stored: unknown;
        try {
            stored = await options.readHistory(scope);
        }
        catch (error) {
            if (pendingScopeLoads.get(scopeKey) !== loadingState) {
                return;
            }
            pendingScopeLoads.delete(scopeKey);
            if (loading !== historyLoad) {
                if (loadingState.commands.length) {
                    persist(normalizedScope,
                        mergeRecordedHistory(loadingState.baseline, loadingState.commands), false);
                }
                return;
            }

            historyLoading = null;
            if (loadingState.commands.length) {
                replaceLoadedHistory(loadingState.baseline, loadingState.commands);
                persist();
            }

            throw error;
        }

        if (pendingScopeLoads.get(scopeKey) !== loadingState) {
            return;
        }
        pendingScopeLoads.delete(scopeKey);

        const storedOldestFirst = Array.isArray(stored)
            ? stored
                .map(normalizeHistoryEntry)
                .filter(Boolean)
                .slice(-maximumItems)
            : [];
        const oldestFirst = storedOldestFirst.filter((command) => {
            return !excludeFromHistory(command);
        });

        if (loading !== historyLoad) {
            if (loadingState.commands.length) {
                persist(normalizedScope, mergeRecordedHistory(oldestFirst, loadingState.commands), false);
            }
            return;
        }
        historyLoading = null;

        replaceLoadedHistory(oldestFirst, loadingState.commands);
        oldestFirst
            .slice()
            .reverse()
            .forEach(function(command) {
                options.registerCompletionInput?.(command);
            });

        if (oldestFirst.length !== storedOldestFirst.length || loadingState.commands.length) {
            persist();
        }
    };

    const record = function(rawCommand: string): void {
        const command = normalizeHistoryEntry(rawCommand);

        if (!command) {
            return;
        }

        if (excludeFromHistory(command)) {
            return;
        }

        if (newestFirst[0] !== command) {
            newestFirst.unshift(command);
        }

        if (newestFirst.length > maximumItems) {
            newestFirst.length = maximumItems;
        }

        navigationIndex = -1;
        if (historyLoading) {
            const commands = historyLoading.commands;
            if (commands[commands.length - 1] !== command) {
                commands.push(command);
            }
            if (commands.length > maximumItems) {
                commands.shift();
            }

            return;
        }

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

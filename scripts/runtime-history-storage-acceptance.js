"use strict";

// ONE history policy/case set through native disk and browser Storage mechanics,
// with real R commands. This is not a rendered console or actual Electron IPC.
exports.checkActualHistoryStorage = async function(options) {
    const requireResult = function(condition, message) {
        if (!condition) {
            throw Error(options.host + ": " + message);
        }
    };
    const scope = { productId: "physical-history-acceptance", runtimeId: options.runtimeId };
    const key = "consoleHistory." + scope.productId + "." + scope.runtimeId;
    const stored = Array.from({ length: 505 }, (_, index) => "old(" + index + ")");
    stored[503] = "__DIALOGFORGE_DATASET_READY_stored";
    const notices = [];
    const executions = [];
    const history = options.createHistory({
        readHistory: options.storage.readHistory,
        writeHistory: options.storage.writeHistory,
        onPersistenceFailure: error => notices.push({
            name: String(error.name || ""), code: String(error.code || ""),
            message: String(error.message || error)
        })
    });
    const settleWrites = () => new Promise(resolve => setTimeout(resolve, 0));
    const commands = [
        'history_acceptance_value <- 2L; cat("history-value=2\\n")',
        'history_acceptance_value <- 4L; cat("history-value=4\\n")',
        'stop("history-real-evaluation-error")',
        'history_acceptance_value <- 6L; cat("history-value=6\\n")'
    ];
    const submit = async function(command) {
        history.record(command);
        const result = await options.execute(command, "answer");
        await settleWrites();
        executions.push({ command, outcome: result.outcome,
            output: result.records.map(record => record.event.message || "").join("") });
        return result;
    };
    let failureMechanic;
    try {
        await options.storage.prepare({ unrelatedSetting: true,
            "consoleHistory.other.r": ["other()"], [key]: stored });
        await history.load(scope);
        await settleWrites();
        requireResult(history.getInputHistory().length === 499
            && history.getInputHistory()[0] === "old(5)", "Stored limit/internal exclusion changed");
        failureMechanic = await options.storage.failWrites();
        const persistedBefore = JSON.stringify(await options.storage.readSettings());
        const first = await submit(commands[0]);
        requireResult(first.outcome === "success" && executions[0].output.includes("history-value=2"),
            "A real R command did not complete after physical history failure");
        requireResult(notices.length === 1, "Physical history write failure was not reported once");
        history.record(commands[0]);
        await settleWrites();
        requireResult(notices.length === 1 && history.navigate(-1).value === commands[0],
            "Failure burst or in-memory navigation/duplicate behavior changed");
        requireResult(JSON.stringify(await options.storage.readSettings()) === persistedBefore,
            "Failed physical persistence was treated as saved history");
        await options.storage.recoverWrites();
        requireResult((await submit(commands[1])).outcome === "success", "R command after storage recovery failed");
        const saved = await options.storage.readSettings();
        requireResult(JSON.stringify(saved[key]) === JSON.stringify(history.getInputHistory()),
            "Recovery did not persist the entire current chronological history");
        requireResult(saved.unrelatedSetting === true
            && JSON.stringify(saved["consoleHistory.other.r"]) === '["other()"]', "Recovery lost unrelated settings");
        const reopened = options.createHistory({ readHistory: options.storage.readHistory,
            writeHistory: options.storage.writeHistory });
        await reopened.load(scope);
        requireResult(reopened.navigate(-1).value === commands[1], "Reopened physical history lost current command");
        await options.storage.failWrites();
        const failure = await submit(commands[2]);
        requireResult(failure.outcome === "error" && executions[2].output.includes("history-real-evaluation-error"),
            "Advisory storage handling hid the real R evaluation failure");
        requireResult(notices.length === 2, "A new physical failure after recovery was not reported");
        await options.storage.recoverWrites();
        requireResult((await submit(commands[3])).outcome === "success", "Following real R command did not recover");
        requireResult(history.getInputHistory().length === 500, "History limit changed during failed writes");
        const delayedLoads = [];
        for (const sameScope of [false, true]) {
            for (const rejectOldRead of [false, true]) {
                const replacementScope = sameScope ? scope : {
                    productId: "history-replacement", runtimeId: options.runtimeId
                };
                const replacementKey = "consoleHistory." + replacementScope.productId
                    + "." + replacementScope.runtimeId;
                await options.storage.prepare({ unrelatedSetting: true,
                    [key]: ["old()", "__DIALOGFORGE_DATASET_READY_retired"],
                    [replacementKey]: sameScope
                        ? ["old()", "__DIALOGFORGE_DATASET_READY_retired"] : ["current()"] });
                let releaseOld;
                let rejectOld;
                let reads = 0;
                const completionInputs = [];
                const delayedHistory = options.createHistory({
                    readHistory: async function(request) {
                        const actualStored = await options.storage.readHistory(request);
                        reads += 1;
                        if (reads === 1) {
                            return new Promise((resolve, reject) => {
                                releaseOld = () => resolve(actualStored);
                                rejectOld = reject;
                            });
                        }
                        return actualStored;
                    },
                    writeHistory: options.storage.writeHistory,
                    registerCompletionInput: command => completionInputs.push(command)
                });
                const oldLoad = delayedHistory.load(scope).then(
                    () => ({ rejected: false }), error => ({ rejected: true, error })
                );
                while (!releaseOld) {
                    await settleWrites();
                }
                if (sameScope) {
                    await options.storage.prepare({ unrelatedSetting: true, [key]: ["current()"] });
                }
                await delayedHistory.load(replacementScope);
                delayedHistory.record('cat("history-current-scope\\n")');
                const currentCommand = await options.execute('cat("history-current-scope\\n")', "answer");
                requireResult(currentCommand.outcome === "success", "Current scope command failed");
                if (rejectOldRead) {
                    rejectOld(Error("Controlled late read error after actual physical read"));
                }
                else {
                    releaseOld();
                }
                requireResult(!(await oldLoad).rejected, "Retired read error rejected replacement");
                await settleWrites();
                const expected = ["current()", 'cat("history-current-scope\\n")'];
                requireResult(JSON.stringify(delayedHistory.getInputHistory()) === JSON.stringify(expected),
                    "Retired physical read replaced current history");
                requireResult(JSON.stringify(completionInputs) === '["current()"]',
                    "Retired history entered completion inputs");
                const physicalSaved = await options.storage.readSettings();
                requireResult(JSON.stringify(physicalSaved[replacementKey]) === JSON.stringify(expected),
                    "Retired marker cleanup overwrote current physical history");
                requireResult(physicalSaved.unrelatedSetting === true, "Scope replacement lost unrelated setting");
                delayedLoads.push({ sameScope, rejectOldRead, history: expected,
                    actualStorageReadChecked: true, controlledResponseDelay: true,
                    actualCurrentCommandChecked: true });
            }
        }
        const pendingLoadCommands = [];
        for (const rejectRead of [false, true]) {
            await options.storage.prepare({ unrelatedSetting: true, [key]: ["before_load()"] });
            let hold = false;
            let release;
            let reject;
            let reached;
            const began = new Promise(resolve => { reached = resolve; });
            const pendingHistory = options.createHistory({
                readHistory: async request => {
                    const stored = await options.storage.readHistory(request);
                    if (!hold) return stored;
                    return new Promise((resolve, fail) => {
                        release = () => resolve(stored);
                        reject = fail;
                        reached();
                    });
                },
                writeHistory: options.storage.writeHistory
            });
            await pendingHistory.load(scope);
            hold = true;
            const loading = pendingHistory.load(scope).then(() => null, error => error);
            await began;
            const command = 'history_during_load <- 41L; cat("history-during-load\\n")';
            pendingHistory.record(command);
            pendingHistory.record(command);
            const executed = await options.execute(command, "answer");
            requireResult(executed.outcome === "success", "Actual command during history read failed");
            const failure = Error("Controlled current history read failure after actual stored read");
            if (rejectRead) reject(failure);
            else release();
            requireResult(await loading === (rejectRead ? failure : null),
                "Current physical read error was hidden or success invented");
            await settleWrites();
            const expected = ["before_load()", command];
            const settings = await options.storage.readSettings();
            requireResult(JSON.stringify(pendingHistory.getInputHistory()) === JSON.stringify(expected)
                && JSON.stringify(settings[key]) === JSON.stringify(expected),
                "Current delayed load erased accepted command or saved history");
            requireResult(settings.unrelatedSetting === true, "Merged history lost unrelated settings");
            const reopened = options.createHistory({ readHistory: options.storage.readHistory,
                writeHistory: options.storage.writeHistory });
            await reopened.load(scope);
            requireResult(reopened.navigate(-1).value === command,
                "Actual reopened history lost command submitted during pending read");
            pendingLoadCommands.push({ rejectRead, actualStorageRead: true, actualRCommand: true,
                controlledReadDelay: true, commandRetained: true, persistedAndReopened: true,
                currentReadErrorPropagated: rejectRead });
            const cleaned = await options.execute("rm(history_during_load)", "answer");
            requireResult(cleaned.outcome === "success", "History pending-command fixture cleanup failed");
        }
        const pendingScopeCommands = [];
        for (const sameScope of [false, true]) {
            const currentScope = sameScope ? scope : {
                productId: "physical-history-current", runtimeId: options.runtimeId
            };
            const currentKey = "consoleHistory." + currentScope.productId + "." + currentScope.runtimeId;
            await options.storage.prepare({ unrelatedSetting: true, [key]: ["old_stored()"],
                ...(sameScope ? {} : { [currentKey]: ["current_stored()"] }) });
            let release;
            let reached;
            let reads = 0;
            const began = new Promise(resolve => { reached = resolve; });
            const pendingHistory = options.createHistory({
                readHistory: async request => {
                    const stored = await options.storage.readHistory(request);
                    if (++reads !== 1) return stored;
                    return new Promise(resolve => {
                        release = () => resolve(stored);
                        reached();
                    });
                },
                writeHistory: options.storage.writeHistory
            });
            const oldLoad = pendingHistory.load(scope);
            await began;
            const oldCommand = "history_scope_old <- 51L";
            pendingHistory.record(oldCommand);
            requireResult((await options.execute(oldCommand, "answer")).outcome === "success",
                "Actual old-scope command failed");
            if (sameScope) {
                await options.storage.prepare({ unrelatedSetting: true, [key]: ["current_stored()"] });
            }
            await pendingHistory.load(currentScope);
            const currentCommand = "history_scope_current <- 52L";
            pendingHistory.record(currentCommand);
            requireResult((await options.execute(currentCommand, "answer")).outcome === "success",
                "Actual current-scope command failed");
            release();
            await oldLoad;
            await settleWrites();
            const expected = sameScope
                ? ["current_stored()", oldCommand, currentCommand] : ["current_stored()", currentCommand];
            const settings = await options.storage.readSettings();
            requireResult(JSON.stringify(pendingHistory.getInputHistory()) === JSON.stringify(expected)
                && JSON.stringify(settings[currentKey]) === JSON.stringify(expected),
                "Scope replacement lost or mixed accepted commands");
            if (!sameScope) {
                requireResult(JSON.stringify(settings[key]) === JSON.stringify(["old_stored()", oldCommand]),
                    "Retired scope lost its own accepted command or stored history");
            }
            requireResult(settings.unrelatedSetting === true, "Scope replacement lost unrelated setting");
            const reopened = options.createHistory({ readHistory: options.storage.readHistory,
                writeHistory: options.storage.writeHistory });
            await reopened.load(currentScope);
            requireResult(reopened.navigate(-1).value === currentCommand, "Current scope did not reopen correctly");
            pendingScopeCommands.push({ sameScope, actualStorageRead: true, actualRCommands: 2,
                controlledReadDelay: true, earlierCommandSaved: true, currentScopeIsolated: true,
                persistedAndReopened: true });
            requireResult((await options.execute("rm(history_scope_old, history_scope_current)", "answer")).outcome
                === "success", "History scope command fixture cleanup failed");
        }
        return { host: options.host, failureMechanic, notices, executions,
            historyLength: history.getInputHistory().length, unrelatedSettingsPreserved: true,
            chronologicalReplay: true, delayedLoads, pendingLoadCommands, pendingScopeCommands,
            renderedConsoleChecked: false,
            physicalElectronIpcChecked: false };
    } finally {
        await options.storage.recoverWrites();
        await options.storage.cleanup();
    }
};

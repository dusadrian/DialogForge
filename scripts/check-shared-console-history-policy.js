"use strict";

const assert = require("node:assert/strict");
const { createConsoleCommandHistory } = require("../dist/src/console/services/consoleCommandHistory");
const {
    createConsoleHistorySettingsStore
} = require("../dist/src/console/services/consoleHistorySettingsStore");
const {
    createConsoleHistoryIpcController
} = require("../dist/src/shell-electron/console/consoleHistoryIpcController");
const {
    consoleHistoryIpcChannels,
    invokeConsoleHistoryRoute
} = require("../dist/src/console/services/consoleHistoryIpc");
const {
    createBrowserStorageAdapter
} = require("../dist/src/shell-web/browserStorageAdapter");
const {
    createConsoleSessionState
} = require("../dist/src/console/services/consoleSessionState");
const {
    createConsoleTranscriptService
} = require("../dist/src/console/services/consoleTranscriptService");
const Module = require("node:module");


const settleHistoryWrites = function() {
    return new Promise((resolve) => setImmediate(resolve));
};


const createHistoryStorageFixture = function(host, entries) {
    const runtimeId = host === "native" ? "r" : "webr";
    const scope = { productId: "history-acceptance", runtimeId };
    const key = `consoleHistory.${scope.productId}.${runtimeId}`;
    const writeFailure = new Error("Synthetic history storage failure");
    let failing = false;
    let writeAttempts = 0;
    let settings = {
        unrelatedSetting: true,
        "consoleHistory.other.r": ["other()"],
        [key]: entries
    };
    let readSettings = () => settings;
    const beforeWrite = function() {
        writeAttempts += 1;

        if (failing) {
            throw writeFailure;
        }
    };
    let writeSettings = (value) => {
        beforeWrite();
        settings = value;
    };

    if (host === "worker") {
        const values = new Map([["history-acceptance", JSON.stringify(settings)]]);
        const storage = createBrowserStorageAdapter({
            settingsKey: "history-acceptance",
            storage: {
                getItem: (name) => values.get(name) ?? null,
                setItem: (name, value) => {
                    beforeWrite();
                    values.set(name, value);
                }
            }
        });
        readSettings = storage.readSettings;
        writeSettings = storage.writeSettings;
    }

    const store = createConsoleHistorySettingsStore({
        defaultProductId: scope.productId,
        defaultRuntimeId: runtimeId,
        readSettings,
        writeSettings
    });
    let readHistory = async (input) => store.read(input);
    let writeHistory = (input) => store.write(input);

    if (host === "native") {
        const routes = new Map();
        createConsoleHistoryIpcController({
            ipcMain: { handle: (channel, callback) => routes.set(channel, callback) },
            historyStore: store
        });
        const transport = {
            invoke: (channel, ...args) => routes.get(channel)({}, ...args)
        };
        readHistory = (input) => {
            return invokeConsoleHistoryRoute(transport, consoleHistoryIpcChannels.read, input);
        };
        writeHistory = (input) => {
            return invokeConsoleHistoryRoute(transport, consoleHistoryIpcChannels.write, input);
        };
    }

    return {
        scope,
        key,
        readSettings,
        readHistory,
        writeHistory,
        writeFailure,
        setWriteFailure: (value) => { failing = value; },
        getWriteAttempts: () => writeAttempts
    };
};


const checkStoredHistory = async function(host) {
    const seed = Array.from({ length: 505 }, (_value, index) => `line(${index})`);
    seed[503] = "__DIALOGFORGE_DATASET_READY_stored";
    const storage = createHistoryStorageFixture(host, seed);
    const { scope, key, readHistory, writeHistory, readSettings } = storage;
    const history = createConsoleCommandHistory({ readHistory, writeHistory });
    await history.load(scope);
    assert.equal(history.getInputHistory().length, 499, host);
    assert.equal(history.getInputHistory()[0], "line(5)");
    assert.equal(history.getInputHistory().at(-1), "line(504)");
    history.record("line(505)");
    history.record("line(505)");
    history.record("__DIALOGFORGE_DATASET_READY_new");
    await Promise.resolve();

    assert.equal(history.getInputHistory().length, 500);
    assert.equal(history.navigate(-1).value, "line(505)");
    assert.equal(history.navigate(-1).value, "line(504)");
    const saved = readSettings();
    assert.equal(saved.unrelatedSetting, true);
    assert.deepEqual(saved["consoleHistory.other.r"], ["other()"]);
    assert.deepEqual(saved[key], history.getInputHistory(),
        "Physical storage retains oldest-first editor history without internal entries.");

    const reopened = createConsoleCommandHistory({ readHistory, writeHistory });
    await reopened.load(scope);
    assert.deepEqual(reopened.getInputHistory(), history.getInputHistory());
    assert.equal(reopened.navigate(-1).value, "line(505)");
};


const checkHistoryWriteFailure = async function(host, createConsoleServices, initializeInput) {
    const storage = createHistoryStorageFixture(host, [
        "before()",
        "__DIALOGFORGE_DATASET_READY_stored"
    ]);
    storage.setWriteFailure(true);
    const failures = [];
    const commands = [];
    let executionFailure = null;
    const snapshot = { status: "ready", providerId: "r", lifecycleGeneration: 1 };
    const session = createConsoleSessionState(() => snapshot.status);
    const services = createConsoleServices({
        document: { getElementById: () => null },
        session,
        completion: {},
        history: {
            readHistory: storage.readHistory,
            writeHistory: storage.writeHistory,
            onPersistenceFailure: (error) => failures.push(error)
        },
        coordinator: {
            getRuntimeSession: () => snapshot,
            startRuntimeSession: async () => snapshot,
            renderStatus() {},
            navigateFallbackHistory() {},
            executeRuntimeMethod: async () => ({ status: "ready" }),
            executeVisibleCommand: async (request) => {
                commands.push(request.text);

                if (executionFailure) {
                    throw executionFailure;
                }

                return 2;
            },
            openHelpTopic() {},
            writeClipboardText() {}
        }
    });
    await services.commandHistory.load(storage.scope);
    await settleHistoryWrites();
    assert.deepEqual(services.commandHistory.getInputHistory(), ["before()"]);
    assert.deepEqual(failures, [storage.writeFailure], host);
    assert.equal(services.coordinator.getTranscript(), null,
        "A bootstrap history failure must not create the console surface early.");

    if (initializeInput) {
        await services.coordinator.initializeInput();
    }
    else {
        services.coordinator.initializeFlow();
    }

    const transcript = services.coordinator.getTranscript();
    const streams = () => transcript.getRuntimeItems().flatMap((item) => item.activityItems);
    assert.equal(streams().length, 1,
        "The pending notice must appear when the shared flow becomes ready.");
    assert.equal(streams()[0].type, "warning");
    assert.equal(streams()[0].origin, "console");
    assert.match(streams()[0].outputLines.join("\n"), /saved history may be incomplete/);
    services.coordinator.initializeFlow();
    assert.equal(streams().length, 1, "Repeated initialization must not replay the notice.");

    const receipt = await services.coordinator.executeWithReceipt("1 + 1", "history-acceptance");
    await settleHistoryWrites();
    assert.equal(receipt.accepted, true);
    assert.deepEqual(commands, ["1 + 1"],
        "A physical history write failure must not prevent the common submission.");
    assert.equal(session.isRuntimeBusy(), false);
    assert.deepEqual(services.commandHistory.getInputHistory(), ["before()", "1 + 1"]);
    assert.equal(services.commandHistory.navigate(-1).value, "1 + 1");
    assert.equal(failures.length, 1, "One failing write burst produces one notice.");
    assert.equal(streams().length, 1);
    assert.deepEqual(storage.readSettings()[storage.key], [
        "before()",
        "__DIALOGFORGE_DATASET_READY_stored"
    ], "A failed write must not be presented as saved history.");
    const attempts = storage.getWriteAttempts();
    services.commandHistory.record("__DIALOGFORGE_DATASET_READY_new");
    assert.equal(storage.getWriteAttempts(), attempts);

    storage.setWriteFailure(false);
    await services.coordinator.executeWithReceipt("2 + 2", "history-acceptance");
    await settleHistoryWrites();
    const saved = storage.readSettings();
    assert.deepEqual(saved[storage.key], services.commandHistory.getInputHistory(),
        "A later successful write retries the entire in-window chronological history.");
    assert.equal(saved.unrelatedSetting, true);
    assert.deepEqual(saved["consoleHistory.other.r"], ["other()"]);
    assert.equal(failures.length, 1);

    storage.setWriteFailure(true);
    await services.coordinator.executeWithReceipt("3 + 3", "history-acceptance");
    await settleHistoryWrites();
    assert.equal(failures.length, 2, "A new failure after recovery must be reported.");
    assert.equal(streams().length, 2);
    assert.deepEqual(commands, ["1 + 1", "2 + 2", "3 + 3"]);
    assert.equal(session.isRuntimeBusy(), false);

    executionFailure = new Error("Runtime evaluation failed");
    await assert.rejects(
        services.coordinator.executeWithReceipt("stop()", "history-acceptance"),
        (error) => error === executionFailure
    );
    await settleHistoryWrites();
    assert.equal(session.isRuntimeBusy(), false);
    assert.equal(failures.length, 2,
        "Isolating history failure must not hide the actual execution error.");
};


const checkSharedHistoryNotices = async function() {
    const surfacePath = require.resolve("../dist/src/console/renderer/consoleSurface");
    const coordinatorPath = require.resolve("../dist/src/console/renderer/mainConsoleCoordinator");
    const servicesPath = require.resolve("../dist/src/console/renderer/consoleServices");
    const paths = [surfacePath, coordinatorPath, servicesPath];
    const previousModules = paths.map((filename) => require.cache[filename]);
    const surfaceModule = new Module(surfacePath, module);
    surfaceModule.loaded = true;
    surfaceModule.exports = {
        createConsoleSurface: function() {
            const transcript = createConsoleTranscriptService();
            let ready = false;

            return {
                initializeFlow: () => { ready = true; },
                initializeInput: async () => { ready = true; },
                getTranscript: () => ready ? transcript : null
            };
        }
    };

    try {
        require.cache[surfacePath] = surfaceModule;
        delete require.cache[coordinatorPath];
        delete require.cache[servicesPath];
        const { createConsoleServices } = require(servicesPath);

        // Only the painted surface is substituted. History, submission, IPC,
        // storage, composition, notice buffering and transcript are real owners.
        for (const host of ["native", "worker"]) {
            await checkHistoryWriteFailure(host, createConsoleServices, false);
            await checkHistoryWriteFailure(host, createConsoleServices, true);
        }
    }
    finally {
        paths.forEach((filename, index) => {
            if (previousModules[index]) {
                require.cache[filename] = previousModules[index];
            }
            else {
                delete require.cache[filename];
            }
        });
    }
};


const checkLateHistoryWrites = async function() {
    const writes = [];
    const failures = [];
    const history = createConsoleCommandHistory({
        readHistory: async (scope) => scope.productId === "replacement" ? ["replacement()"] : [],
        writeHistory: () => new Promise((resolve, reject) => writes.push({ resolve, reject })),
        onPersistenceFailure: (error) => failures.push(error)
    });
    await history.load({ productId: "base", runtimeId: "r" });
    history.record("older()");
    history.record("newer()");
    writes[1].resolve();
    await settleHistoryWrites();
    writes[0].reject(new Error("Late failure superseded by a saved full history"));
    await settleHistoryWrites();
    assert.equal(failures.length, 0);

    history.record("pending()");
    await history.load({ productId: "replacement", runtimeId: "r" });
    writes[2].reject(new Error("Retired scope failure"));
    await settleHistoryWrites();
    assert.equal(failures.length, 0);
    assert.deepEqual(history.getInputHistory(), ["replacement()"]);
    history.record("current()");
    const failure = new Error("Current scope failure");
    writes[3].reject(failure);
    await settleHistoryWrites();
    assert.deepEqual(failures, [failure]);

    history.record("older_save()");
    history.record("newer_failure()");
    writes[5].reject(failure);
    await settleHistoryWrites();
    writes[4].resolve();
    await settleHistoryWrites();
    history.record("still_failing()");
    writes[6].reject(failure);
    await settleHistoryWrites();
    assert.equal(failures.length, 1,
        "An older success cannot reset the newer failing-write burst.");

    history.record("recovered()");
    writes[7].resolve();
    await settleHistoryWrites();
    history.record("failed_again()");
    writes[8].reject(failure);
    await settleHistoryWrites();
    assert.equal(failures.length, 2);
};


const checkDelayedHistoryLoads = async function() {
    for (const sameScope of [false, true]) {
        for (const rejectOldRead of [false, true]) {
            let resolveOld;
            let rejectOld;
            let reads = 0;
            const completions = [];
            const writes = [];
            const history = createConsoleCommandHistory({
                readHistory: () => {
                    reads += 1;
                    if (reads === 1) {
                        return new Promise((resolve, reject) => {
                            resolveOld = resolve;
                            rejectOld = reject;
                        });
                    }

                    return Promise.resolve(["current()"]);
                },
                writeHistory: request => writes.push(request),
                registerCompletionInput: command => completions.push(command)
            });
            const scope = { productId: "base", runtimeId: "r" };
            const oldRead = history.load(scope);
            const oldOutcome = oldRead.then(
                () => ({ rejected: false }),
                error => ({ rejected: true, error })
            );
            await history.load(sameScope ? scope : { ...scope, productId: "replacement" });
            history.record("new_command()");
            if (rejectOldRead) {
                rejectOld(new Error("Retired physical read failed"));
            }
            else {
                resolveOld(["old()", "__DIALOGFORGE_DATASET_READY_retired"]);
            }

            assert.equal((await oldOutcome).rejected, false,
                "A retired optional read must not reject current initialization.");
            assert.deepEqual(history.getInputHistory(), ["current()", "new_command()"],
                "A retired read must not replace current history.");
            assert.deepEqual(completions, ["current()"],
                "Retired history must not register obsolete completions.");
            assert.equal(writes.length, 1,
                "Retired reserved-marker cleanup must not write into the current scope.");
        }
    }

    const currentFailure = new Error("Current history read failed");
    const history = createConsoleCommandHistory({
        readHistory: async () => { throw currentFailure; },
        writeHistory: () => {}
    });
    await assert.rejects(
        history.load({ productId: "base", runtimeId: "r" }),
        error => error === currentFailure
    );
};


const checkCommandsDuringHistoryLoad = async function() {
    for (const host of ["native", "worker"]) {
        for (const rejectRead of [false, true]) {
            const storage = createHistoryStorageFixture(host, ["stored()", "latest()"]);
            let release;
            let reject;
            let started;
            const began = new Promise(resolve => { started = resolve; });
            let hold = false;
            const completions = [];
            const history = createConsoleCommandHistory({
                readHistory: async request => {
                    const stored = await storage.readHistory(request);
                    if (!hold) return stored;
                    return new Promise((resolve, fail) => {
                        release = () => resolve(stored);
                        reject = fail;
                        started();
                    });
                },
                writeHistory: storage.writeHistory,
                registerCompletionInput: command => completions.push(command)
            });
            await history.load(storage.scope);
            const beforeWrites = storage.getWriteAttempts();
            hold = true;
            const pending = history.load(storage.scope);
            const outcome = pending.then(() => null, error => error);
            await began;
            history.record("latest()");
            history.record("during_load()");
            history.record("during_load()");
            const failure = new Error("Current history read failed");
            if (rejectRead) reject(failure);
            else release();
            assert.equal(await outcome, rejectRead ? failure : null,
                "Current load error must still be observable.");
            await settleHistoryWrites();
            const expected = ["stored()", "latest()", "during_load()"];
            assert.deepEqual(history.getInputHistory(), expected,
                `${host}: accepted load must not erase commands recorded while reading`);
            assert.deepEqual(storage.readSettings()[storage.key], expected,
                "The merged history must reach the actual adapter store.");
            assert.equal(storage.getWriteAttempts(), beforeWrites + 1,
                "Pending load defers persistence until current stored/in-memory history is merged.");
            assert.equal(history.navigate(-1).value, "during_load()");
        }
    }

    for (const returnToScope of [false, true]) {
        const readers = [];
        const writes = [];
        const history = createConsoleCommandHistory({
            readHistory: () => new Promise(resolve => readers.push(resolve)),
            writeHistory: request => writes.push(request)
        });
        const first = { productId: "first", runtimeId: "r" };
        const second = { productId: "second", runtimeId: "r" };
        const oldLoad = history.load(first);
        history.record("old_scope_command()");
        const next = history.load(returnToScope ? first : second);
        history.record("current_scope_command()");
        readers[1](["current_stored()"]);
        await next;
        readers[0](["old_stored()"]);
        await oldLoad;
        await settleHistoryWrites();
        assert.deepEqual(history.getInputHistory(), returnToScope
            ? ["current_stored()", "old_scope_command()", "current_scope_command()"]
            : ["current_stored()", "current_scope_command()"]);
        if (returnToScope) {
            assert.equal(writes.length, 1, "Superseded same-scope read must not overwrite newer saved commands");
        } else {
            assert.equal(writes.length, 2);
            assert.deepEqual(writes.find(item => item.productId === "first").history,
                ["old_stored()", "old_scope_command()"], "Earlier scope still saves its accepted command");
            assert.deepEqual(writes.find(item => item.productId === "second").history,
                ["current_stored()", "current_scope_command()"], "Earlier scope cannot enter current store");
        }
    }

    const readers = [];
    const history = createConsoleCommandHistory({
        readHistory: () => new Promise((resolve, reject) => readers.push({ resolve, reject })),
        writeHistory: () => {}
    });
    const scope = { productId: "overlap", runtimeId: "r" };
    const old = history.load(scope);
    history.record("first_pending()");
    history.record("second_pending()");
    const current = history.load(scope).then(() => null, error => error);
    history.record("third_pending()");
    const failed = new Error("Overlapping current read failed");
    readers[1].reject(failed);
    assert.equal(await current, failed);
    readers[0].resolve(["retired_stored()"]);
    await old;
    assert.deepEqual(history.getInputHistory(), ["first_pending()", "second_pending()", "third_pending()"],
        "Carried pending records must not also be included in the fallback baseline.");
};


const checkFailedHistoryNotice = async function() {
    const originalWarn = console.warn;
    const warnings = [];
    const failure = new Error("Physical write failure");

    try {
        console.warn = (...args) => warnings.push(args);

        for (const asynchronous of [false, true]) {
            const history = createConsoleCommandHistory({
                readHistory: async () => [],
                writeHistory: function() {
                    if (asynchronous) {
                        return Promise.reject(failure);
                    }

                    throw failure;
                },
                onPersistenceFailure: () => { throw new Error("Notice failed"); }
            });
            await history.load({ productId: "base", runtimeId: "r" });
            assert.doesNotThrow(() => history.record("still_available()"));
            await settleHistoryWrites();
            assert.deepEqual(history.getInputHistory(), ["still_available()"]);
        }

        assert.equal(warnings.length, 2);
        assert.equal(warnings[0][1], failure);
        assert.equal(warnings[1][1], failure);
    }
    finally {
        console.warn = originalWarn;
    }
};


const main = async function() {
    for (const host of ["native", "worker"]) {
        const writes = [];
        const completions = [];
        const history = createConsoleCommandHistory({
            readHistory: async () => ["first()", "__DIALOGFORGE_DATASET_READY_old", "last()"],
            writeHistory: (request) => writes.push(request),
            registerCompletionInput: (command) => completions.push(command),
            excludeFromHistory: (command) => command === "extra-hidden()"
        });
        await history.load({ productId: "base", runtimeId: host });
        assert.deepEqual(history.getInputHistory(), ["first()", "last()"]);
        assert.deepEqual(completions, ["last()", "first()"]);
        const count = writes.length;
        history.record("__DIALOGFORGE_DATASET_READY_new");
        history.record("extra-hidden()");
        assert.equal(writes.length, count);
        for (let index = 0; index < 501; index += 1) {
            history.record(`command(${index})`);
        }
        assert.equal(history.getInputHistory().length, 500);
        assert.equal(writes.at(-1).history.length, 500);
        assert.equal(history.navigate(-1).value, "command(500)");
        await checkStoredHistory(host);
    }
    await checkSharedHistoryNotices();
    await checkLateHistoryWrites();
    await checkDelayedHistoryLoads();
    await checkCommandsDuringHistoryLoad();
    await checkFailedHistoryNotice();
    console.log("Shared history limit, exclusion and advisory failure cases passed; physical/rendered failure acceptance remains open.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

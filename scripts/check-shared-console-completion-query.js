"use strict";

const assert = require("node:assert/strict");
const {
    createRConsoleCompletionReader,
    readRConsoleRuntimeCompletion,
    readRConsoleCompletionResult
} = require("../dist/src/runtime/providers/r/completions/rConsoleRuntimeCompletion");
const { readWebRConsoleCompletionResult } = require("../dist/src/runtime/providers/webr/webRConsoleCompletionAdapter");

const main = async function() {
    const input = {
        prefix: "na", code: "base:::na", cursorColumn: 11,
        packageName: "base", includeInternals: true
    };
    const requests = [];
    const value = {
        status: "ready", providerId: "fixture", prefix: "na",
        items: [{ label: "names", kind: "function", detail: "fixture" }],
        exports: ["names"], internals: ["names"], symbols: []
    };
    const read = async function(request) { requests.push(request); return value; };
    const native = await readRConsoleRuntimeCompletion(input, {
        source: "base-app.console-input", timeoutMs: 2800, readCompletions: read
    });
    const browser = await readWebRConsoleCompletionResult(input, {
        runtimeSessionManager: { readCompletions: read, getSnapshot: () => ({ status: "ready" }) }, isRuntimeBusy: () => false,
        workspaceObjectNames: () => [], workspaceEntries: () => [], workspaceColumnNames: () => []
    }, 2800);
    assert.equal(native.ok, true);
    assert.deepEqual(browser, native);
    const normalized = requests.map(({ source, ...request }) => request);
    assert.deepEqual(normalized[0], normalized[1]);
    assert.equal(normalized[0].cursorColumn, 11);
    assert.equal(normalized[0].timeoutMs, 2800);
    assert.equal(normalized[0].includeInternals, true);
    assert.equal(normalized[0].packageName, "base");

    const unavailable = await readRConsoleRuntimeCompletion({}, {
        source: "fixture", readCompletions: async () => ({ ...value, status: "unavailable" })
    });
    assert.equal(unavailable.ok, false);
    assert.equal(unavailable.value.status, "unavailable");
    const entries = [{ name: "data", columns: ["alpha", "beta"] }, { name: ".hidden", columns: [] }];
    let queries = 0;
    const provider = async () => { queries += 1; return value; };
    for (const busy of [false, true]) {
        const input = { code: "data$a + unrelated", cursorColumn: 7, prefix: "a" };
        const common = await createRConsoleCompletionReader({
            source: "native",
            readSession: () => ({ owner: "r", snapshot: { status: "ready" } }),
            isRuntimeBusy: () => busy,
            readCompletions: provider, workspaceEntries: () => entries
        })(input);
        const adapted = await readWebRConsoleCompletionResult(input, {
            runtimeSessionManager: { readCompletions: provider, getSnapshot: () => ({ status: "ready" }) },
            isRuntimeBusy: () => busy, workspaceEntries: () => entries,
            workspaceObjectNames: () => entries.map((entry) => entry.name), workspaceColumnNames: () => []
        });
        assert.deepEqual(adapted, common);
        assert.equal(common.value.items[0].label, busy ? "alpha" : "names");
    }
    assert.equal(queries, 2, "Busy completion must not query either runtime adapter.");
    for (const snapshot of [null, { status: "starting" }, { status: "failed" }, { status: "stopped" }]) {
        const before = queries;
        const input = { code: "data$a", prefix: "a" };
        const common = await createRConsoleCompletionReader({
            source: "native", isRuntimeBusy: () => false,
            readSession: () => snapshot ? { owner: "r", snapshot } : null,
            readCompletions: provider, workspaceEntries: () => entries
        })(input);
        const adapted = await readWebRConsoleCompletionResult(input, {
            runtimeSessionManager: snapshot ? { getSnapshot: () => snapshot, readCompletions: provider } : null,
            isRuntimeBusy: () => false, workspaceEntries: () => entries
        });
        assert.deepEqual(adapted, common);
        assert.deepEqual(common.value.items, [{ label: "alpha", kind: "variable" }]);
        assert.equal(queries, before, "Unavailable sessions must use metadata without querying either host.");
    }
    const nested = await readRConsoleCompletionResult({ code: "data$nested$a", prefix: "a" }, {
        source: "fixture", canReadRuntime: () => false,
        readCompletions: provider, workspaceEntries: () => entries
    });
    assert.deepEqual(nested.value.items, [], "Do not invent nested columns from top-level metadata.");
    for (const host of ["r", "webr"]) {
        for (const reject of [false, true]) {
            let generation = 1;
            let finishQuery;
            let queryStarted;
            const began = new Promise((resolve) => { queryStarted = resolve; });
            const query = new Promise((resolve, rejectQuery) => {
                finishQuery = () => reject ? rejectQuery(new Error("retired query")) : resolve(value);
            });
            const manager = {
                getSnapshot: () => ({ status: "ready", lifecycleGeneration: generation }),
                readCompletions: () => { queryStarted(); return query; }
            };
            const result = host === "r"
                ? createRConsoleCompletionReader({
                    source: "native", isRuntimeBusy: () => false,
                    readSession: () => ({ owner: "r", snapshot: manager.getSnapshot() }),
                    readCompletions: manager.readCompletions, workspaceEntries: () => entries
                })(input)
                : readWebRConsoleCompletionResult(input, {
                    runtimeSessionManager: manager, getRuntimeSessionManager: () => manager,
                    isRuntimeBusy: () => false, workspaceEntries: () => entries
                });
            await began;
            generation += 1;
            finishQuery();
            assert.deepEqual(await result, { ok: false, value: { symbols: [], items: [] } },
                "Retired completion success/failure must not publish or use current fallback metadata.");
        }
    }

    let releaseOldManager;
    let oldManagerStarted;
    const oldManagerBegan = new Promise((resolve) => { oldManagerStarted = resolve; });
    const oldManagerQuery = new Promise((resolve) => { releaseOldManager = resolve; });
    let currentManager = {
        getSnapshot: () => ({ status: "ready", lifecycleGeneration: 1 }),
        readCompletions: () => { oldManagerStarted(); return oldManagerQuery; }
    };
    const oldReply = readWebRConsoleCompletionResult(input, {
        runtimeSessionManager: currentManager, getRuntimeSessionManager: () => currentManager,
        isRuntimeBusy: () => false, workspaceEntries: () => entries
    });
    await oldManagerBegan;
    currentManager = { getSnapshot: () => ({ status: "ready", lifecycleGeneration: 1 }) };
    releaseOldManager(value);
    assert.equal((await oldReply).ok, false, "Manager replacement is not equal merely because generations match.");
    console.log("Shared console query and fallback cases passed; rendered completion acceptance remains open.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});

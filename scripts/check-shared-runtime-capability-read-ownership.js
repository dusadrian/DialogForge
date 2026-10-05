"use strict";

const assert = require("node:assert/strict");
const { createRuntimeCapabilityRequestController } = require("../dist/src/runtime/session/runtimeCapabilityRequestController");
const { createRuntimeWorkspaceState } = require("../dist/src/runtime/session/runtimeWorkspaceState");

const cases = [
    { method: "readHelpTopic", request: { topic: "names", source: "case" },
        result: { status: "ready", body: "old help", matches: [{ topic: "names" }] },
        verifyEmpty: (result) => {
            assert.equal(result.body, "");
            assert.deepEqual(result.matches, []);
        } },
    { method: "readCompletions", request: { prefix: "na", source: "case" },
        result: { status: "ready", items: [{ label: "names" }], exports: ["names"] },
        verifyEmpty: (result) => {
            assert.deepEqual(result.items, []);
            assert.deepEqual(result.exports, []);
        } },
    { method: "checkDependencies", request: { kind: "package", names: ["declared"], source: "case" },
        result: { status: "ready", items: [{ name: "declared", status: "available" }] },
        verifyEmpty: (result) => { assert.deepEqual(result.items, []); } },
    { method: "executeInvisibleQuery", request: { query: "1", source: "case" },
        result: { status: "ready", value: "old result" },
        verifyEmpty: (result) => { assert.equal(result.value, null); } }
];

const main = async function() {
    for (const host of ["r", "webr"]) {
        for (const test of cases) {
            for (const transition of ["unchanged", "generation", "provider", "stopped", "restarted"]) {
                let snapshot = { providerId: host, status: "ready", lifecycleGeneration: 1 };
                let finish;
                const pending = new Promise((resolve) => { finish = resolve; });
                let calls = 0;
                const executeRead = function() { calls += 1; return pending; };
                const controller = createRuntimeCapabilityRequestController({
                    getSnapshot: () => ({ ...snapshot }),
                    hasRuntimeCapability: () => true,
                    toolExecutionController: {
                        readHelpTopic: executeRead,
                        readCompletions: executeRead,
                        checkDependencies: executeRead
                    },
                    queryExecutionController: { executeInvisibleQuery: executeRead }
                });
                const read = controller[test.method](test.request);
                assert.equal(calls, 1);
                if (transition === "generation" || transition === "restarted") {
                    snapshot = { ...snapshot, lifecycleGeneration: 2 };
                } else if (transition === "provider") {
                    snapshot = { ...snapshot, providerId: "replacement" };
                } else if (transition === "stopped") {
                    snapshot = { ...snapshot, status: "stopped" };
                }
                finish(test.result);
                const result = await read;
                if (transition === "unchanged") {
                    assert.equal(result, test.result, "Current-owner reads retain their original response.");
                } else {
                    assert.equal(result.status, "unavailable", `${host}/${test.method}/${transition}`);
                    assert.match(result.message, /old result was discarded/);
                    test.verifyEmpty(result);
                }
                assert.equal(calls, 1, "A retired read is never replayed on the replacement runtime.");
            }
        }

        const snapshot = { providerId: host, status: "ready", lifecycleGeneration: 1 };
        const workspace = createRuntimeWorkspaceState(host);
        let finish;
        let rejectRead;
        let calls = 0;
        const controller = createRuntimeCapabilityRequestController({
            getSnapshot: () => ({ ...snapshot }),
            getWorkspaceReadEpoch: workspace.getReadEpoch,
            isWorkspaceReadAvailable: () => ["fresh", "unread"].includes(
                workspace.createSnapshot(snapshot).freshness
            ),
            hasRuntimeCapability: () => true,
            toolExecutionController: {
                readCompletions: () => {
                    calls += 1;
                    return new Promise((resolve, reject) => { finish = resolve; rejectRead = reject; });
                }
            },
            queryExecutionController: {}
        });
        const request = { prefix: "a", code: "probe$a", cursorColumn: 8, source: "case" };
        const ready = { status: "ready", items: [{ label: "alpha" }], symbols: ["alpha"] };
        for (const transition of ["unchanged", "command", "refresh", "stale", "late-error"]) {
            const read = controller.readCompletions(request);
            if (transition === "command" || transition === "late-error") {
                const token = workspace.beginCommandReconciliation();
                workspace.endCommandReconciliation(token);
            } else if (transition === "refresh") {
                workspace.remember([]);
            } else if (transition === "stale") {
                workspace.markStale();
            }
            if (transition === "late-error") {
                rejectRead(new Error("Retired completion failure"));
            } else {
                finish(ready);
            }
            const result = await read;
            if (transition === "unchanged") {
                assert.equal(result, ready);
            } else {
                assert.equal(result.status, "unavailable", `${host}: completion survived ${transition}`);
                assert.deepEqual(result.items, []);
                assert.deepEqual(result.symbols, []);
            }
            workspace.remember([]);
        }
        const token = workspace.beginCommandReconciliation();
        const beforePending = calls;
        assert.equal((await controller.readCompletions(request)).status, "unavailable");
        assert.equal(calls, beforePending, "Pending workspace cannot dispatch completion queries");
        workspace.endCommandReconciliation(token);
        workspace.markStale();
        assert.equal((await controller.readCompletions(request)).status, "unavailable");
        assert.equal(calls, beforePending, "Stale workspace cannot dispatch completion queries");
        workspace.remember([]);
        const recovered = controller.readCompletions(request);
        finish(ready);
        assert.equal(await recovered, ready, "An explicitly fresh completion recovers without replay");
        const currentError = new Error("Current completion failure");
        const failed = controller.readCompletions(request);
        rejectRead(currentError);
        await assert.rejects(failed, error => error === currentError,
            "Current errors must remain errors, not be relabeled retired reads");
    }
    console.log("Shared capability read ownership cases passed; actual host restart acceptance remains open.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

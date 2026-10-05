"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRuntimeOperationQueue } = require("../dist/src/runtime/session/runtimeOperationQueue");

const main = async function() {
    for (const host of ["r", "webr"]) {
        const queue = createRuntimeOperationQueue();
        assert.equal(queue.isActive(), false, host);
        const calls = [];
        let finishFirst;
        let firstStarted;
        const began = new Promise((resolve) => { firstStarted = resolve; });
        const gate = new Promise((resolve) => { finishFirst = resolve; });
        const first = queue.run(async () => {
            calls.push("first"); firstStarted(); await gate; calls.push("first-finished");
        });
        const second = queue.run(async () => { calls.push("second"); });
        await began;
        assert.equal(queue.isActive(), true, host);
        assert.deepEqual(calls, ["first"], host);
        finishFirst();
        await Promise.all([first, second]);
        assert.deepEqual(calls, ["first", "first-finished", "second"]);
        await assert.rejects(queue.run(async () => { throw new Error("operation failed"); }), /operation failed/);
        assert.equal(await queue.run(async () => "retry"), "retry");

        let deliver;
        let receiptAccepted;
        const receiptBegan = new Promise((resolve) => { receiptAccepted = resolve; });
        const delivery = new Promise((resolve) => { deliver = resolve; });
        const receipt = queue.run(async () => "wire-response", () => {
            receiptAccepted();
            return delivery;
        });
        let afterDeliveryStarted = false;
        const afterDelivery = queue.run(async () => { afterDeliveryStarted = true; });
        assert.equal(await receipt, "wire-response", "The consumer must receive the response before finishing delivery.");
        await receiptBegan;
        assert.equal(queue.isActive(), true, "Channel ownership includes response delivery.");
        assert.equal(afterDeliveryStarted, false, "A response is not the queue release barrier.");
        deliver();
        await afterDelivery;
        assert.equal(afterDeliveryStarted, true);

        let finishFailedOperationCleanup;
        const failedOperationCleanup = new Promise((resolve) => { finishFailedOperationCleanup = resolve; });
        const operationFailure = queue.run(async () => {
            throw new Error("evaluation failed");
        }, () => failedOperationCleanup);
        const evaluationRejected = assert.rejects(operationFailure, /evaluation failed/);
        let afterEvaluationFailureStarted = false;
        const afterEvaluationFailure = queue.run(async () => { afterEvaluationFailureStarted = true; });
        await evaluationRejected;
        assert.equal(afterEvaluationFailureStarted, false, "Rejected evaluation still owns its cleanup barrier.");
        finishFailedOperationCleanup();
        await afterEvaluationFailure;
        assert.equal(afterEvaluationFailureStarted, true);

        const failedDeliveryQueue = createRuntimeOperationQueue();
        let failDelivery;
        const failedDelivery = new Promise((_, reject) => { failDelivery = reject; });
        const accepted = failedDeliveryQueue.run(async () => "accepted", () => failedDelivery);
        let afterFailureStarted = false;
        const afterFailure = failedDeliveryQueue.run(async () => { afterFailureStarted = true; });
        const failed = assert.rejects(afterFailure, /delivery failed/);
        assert.equal(await accepted, "accepted");
        failDelivery(new Error("delivery failed"));
        await failed;
        assert.equal(afterFailureStarted, false);

        let finishActive;
        let activeStarted;
        const activeBegan = new Promise((resolve) => { activeStarted = resolve; });
        const activeGate = new Promise((resolve) => { finishActive = resolve; });
        const active = queue.run(async () => { activeStarted(); await activeGate; });
        let queuedStarted = false;
        const queued = queue.run(async () => { queuedStarted = true; });
        const rejected = assert.rejects(queued, /runtime-session-detached/);
        await activeBegan;
        queue.retire(new Error("runtime-session-detached"));
        await rejected;
        await assert.rejects(queue.run(async () => {}), /runtime-session-detached/);
        assert.equal(queuedStarted, false);
        finishActive();
        await active;
        assert.equal(queuedStarted, false, "An old active finalizer cannot dispatch retired queued work.");
        assert.equal(await createRuntimeOperationQueue().run(async () => "replacement"), "replacement");
    }

    for (const relativePath of [
        "src/runtime/providers/r/protocol/runtimeControlClient.ts", "src/shell-web/pages/shell.js"
    ]) {
        const source = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
        assert.ok(source.includes("createRuntimeOperationQueue()"));
    }
    console.log("Shared runtime operation queue cases passed; real channel drain/prompt acceptance remains open.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

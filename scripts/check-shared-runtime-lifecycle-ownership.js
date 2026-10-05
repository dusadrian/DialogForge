"use strict";

const assert = require("node:assert/strict");
const { createRuntimeSessionLifecycleState } = require("../dist/src/runtime/session/runtimeSessionLifecycleState");
const { createRuntimeLifecycleExecutionController } = require("../dist/src/runtime/session/runtimeLifecycleExecutionController");

const main = async function() {
    for (const host of ["r", "webr"]) {
        for (const [olderAction, newerAction] of [
            ["start", "start"], ["stop", "stop"], ["start", "stop"], ["stop", "start"]
        ]) {
            const lifecycle = createRuntimeSessionLifecycleState({
                providerId: host, status: olderAction === "start" ? "stopped" : "ready",
                connection: "connected", message: "initial"
            });
            const pending = [];
            const runPhysicalTransition = function(action) {
                return new Promise((resolve) => { pending.push({ action, resolve }); });
            };
            let invalidations = 0;
            let retirements = 0;
            const controller = createRuntimeLifecycleExecutionController({
                initialMessage: "ready", lifecycleState: lifecycle,
                getSnapshot: lifecycle.getSnapshot,
                invalidateWorkspace: () => { invalidations += 1; },
                retireRuntimeResources: () => { retirements += 1; },
                lifecycleController: {
                    start: () => runPhysicalTransition("start"),
                    stop: () => runPhysicalTransition("stop")
                }
            });
            const older = controller[olderAction]();
            const rejected = assert.rejects(older, new RegExp(`Runtime ${olderAction} was superseded`));
            const newer = controller[newerAction]();
            assert.deepEqual(pending.map((entry) => entry.action), [olderAction, newerAction]);
            pending[1].resolve({
                providerId: host,
                status: newerAction === "start" ? "ready" : "stopped",
                message: "newer transition", connection: "connected"
            });
            const accepted = await newer;
            assert.equal(accepted.lifecycleGeneration, 2);
            pending[0].resolve({
                providerId: host,
                status: olderAction === "start" ? "ready" : "stopped",
                message: "obsolete transition", connection: "connected"
            });
            await rejected;
            assert.deepEqual(lifecycle.getSnapshot(), accepted,
                "Late physical completion cannot claim the newer transition's successful receipt.");
            assert.equal(invalidations, 2);
            assert.equal(retirements, newerAction === "stop" ? 1 : 0,
                "Only a successful current stop retires presentation resources.");
        }
        for (const action of ["start", "stop"]) {
            for (const superseded of [false, true]) {
                const lifecycle = createRuntimeSessionLifecycleState({
                    providerId: host, status: action === "start" ? "stopped" : "ready",
                    connection: "connected", message: "initial"
                });
                let fail;
                let retirements = 0;
                const physical = new Promise((_, reject) => { fail = reject; });
                const controller = createRuntimeLifecycleExecutionController({
                    initialMessage: "ready", lifecycleState: lifecycle,
                    getSnapshot: lifecycle.getSnapshot, invalidateWorkspace: () => {},
                    retireRuntimeResources: () => { retirements += 1; },
                    lifecycleController: { start: () => physical, stop: () => physical }
                });
                const failure = new Error(`physical ${action} failed`);
                const operation = controller[action]();
                const rejected = assert.rejects(operation, (error) => error === failure);
                let replacement;
                if (superseded) {
                    const generation = lifecycle.beginTransition();
                    lifecycle.commit(generation, {
                        providerId: host, status: "ready", connection: "connected", message: "replacement"
                    });
                    replacement = lifecycle.getSnapshot();
                }
                fail(failure);
                await rejected;
                assert.equal(retirements, 0, "Failed stops do not retire presentation resources.");
                if (superseded) {
                    assert.deepEqual(lifecycle.getSnapshot(), replacement,
                        "An obsolete physical failure cannot fail the replacement session.");
                } else {
                    assert.equal(lifecycle.getSnapshot().status, "failed");
                    assert.equal(lifecycle.getSnapshot().message, failure.message);
                }
            }
        }
        const readyLifecycle = createRuntimeSessionLifecycleState({
            providerId: host, status: "ready", connection: "connected", message: "attached"
        });
        let readyInvalidations = 0;
        let readyStarts = 0;
        const readyController = createRuntimeLifecycleExecutionController({
            initialMessage: "ready",
            lifecycleState: readyLifecycle,
            getSnapshot: readyLifecycle.getSnapshot,
            invalidateWorkspace() { readyInvalidations += 1; },
            lifecycleController: {
                start: async (snapshot) => { readyStarts += 1; return snapshot; }
            }
        });
        const initialReady = readyLifecycle.getSnapshot();
        assert.deepEqual(await readyController.start(), initialReady);
        assert.deepEqual(await readyController.start(), initialReady);
        assert.equal(readyInvalidations, 0, "Ensuring ready cannot retire the attached R revision.");
        assert.equal(readyStarts, 0, "An already-ready start is not a physical transition.");

        const stoppedLifecycle = createRuntimeSessionLifecycleState({
            providerId: host, status: "ready", connection: "connected", message: "initial"
        });
        let retiredWithoutPhysicalController = 0;
        const logicalController = createRuntimeLifecycleExecutionController({
            initialMessage: "ready",
            lifecycleState: stoppedLifecycle,
            getSnapshot: stoppedLifecycle.getSnapshot,
            invalidateWorkspace() {},
            retireRuntimeResources() { retiredWithoutPhysicalController += 1; }
        });

        assert.equal((await logicalController.stop()).status, "stopped");
        assert.equal(retiredWithoutPhysicalController, 1,
            "Logical worker session stops use the same retirement notification.");

        const unsuccessfulStop = createRuntimeLifecycleExecutionController({
            initialMessage: "ready",
            lifecycleState: stoppedLifecycle,
            getSnapshot: stoppedLifecycle.getSnapshot,
            invalidateWorkspace() {},
            retireRuntimeResources() { retiredWithoutPhysicalController += 1; },
            lifecycleController: {
                stop: async () => ({
                    providerId: host, status: "failed", connection: "connected",
                    message: "Stop was not completed."
                })
            }
        });

        assert.equal((await unsuccessfulStop.stop()).status, "failed");
        assert.equal(retiredWithoutPhysicalController, 1,
            "A resolved but unsuccessful stop receipt does not retire resources.");
    }
    console.log("Shared lifecycle ownership cases passed; actual host transition acceptance remains open.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

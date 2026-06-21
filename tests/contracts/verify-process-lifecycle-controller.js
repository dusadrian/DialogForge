"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { createProcessLifecycleController } = require("../../shared/runtime/session/processLifecycleController");
const createSnapshot = function () {
    return {
        providerId: "process-test",
        status: "starting",
        connection: "test",
        message: "Process test is starting."
    };
};
const verifyProcessLifecycle = async function () {
    const controller = createProcessLifecycleController({
        createLaunchPlan: function () {
            return {
                command: process.execPath,
                args: ["-e", "setInterval(() => {}, 1000);"],
                cwd: process.cwd(),
                env: Object.assign({}, process.env),
                readyMessage: "Process test is running.",
                stoppedMessage: "Process test is stopped."
            };
        },
        startupTimeoutMs: 120
    });
    const started = await controller.start(createSnapshot());
    assert.strictEqual(started.status, "ready");
    assert.strictEqual(started.connection, "process");
    assert.strictEqual(started.message, "Process test is running.");
    const repeated = await controller.start(started);
    assert.strictEqual(repeated.status, "ready");
    assert.strictEqual(repeated.message, "Process test is running.");
    const stopped = await controller.stop(repeated);
    assert.strictEqual(stopped.status, "stopped");
    assert.strictEqual(stopped.connection, "process");
    assert.strictEqual(stopped.message, "Process test is stopped.");
};
const verifyProcessStartFailure = async function () {
    const controller = createProcessLifecycleController({
        createLaunchPlan: function () {
            return {
                command: process.execPath,
                args: ["-e", "process.exit(19);"],
                cwd: process.cwd(),
                env: Object.assign({}, process.env),
                readyMessage: "Should not be ready.",
                stoppedMessage: "Process test is stopped."
            };
        },
        startupTimeoutMs: 120
    });
    const started = await controller.start(createSnapshot());
    assert.strictEqual(started.status, "failed");
    assert.strictEqual(started.connection, "process");
    assert.match(started.message, /exited during startup/);
};
verifyProcessLifecycle()
    .then(verifyProcessStartFailure)
    .then(() => {
    console.log("Process lifecycle controller contract verified.");
})
    .catch((error) => {
    console.error(error);
    process.exit(1);
});

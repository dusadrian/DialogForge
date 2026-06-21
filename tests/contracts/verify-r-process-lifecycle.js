"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { execFileSync } = require("child_process");
const { getRuntimeProvider } = require("../../shared/runtime/providers/runtimeProviderRegistry");
const { createRuntimeSessionManager } = require("../../shared/runtime/session/runtimeSessionManager");
const verifyLocalRExists = function () {
    execFileSync("R", ["--version"], {
        stdio: "ignore"
    });
};
const verifyRProcessLifecycle = async function () {
    verifyLocalRExists();
    process.env.DIALOGFORGE_R_PROCESS = "1";
    const disabledProvider = getRuntimeProvider("r", {
        processLifecycle: false
    });
    assert.strictEqual(disabledProvider.lifecycleController, undefined, "An explicit lifecycle policy must override the legacy environment fallback.");
    const manager = createRuntimeSessionManager(getRuntimeProvider("r", {
        processLifecycle: true
    }));
    const started = await manager.start();
    assert.strictEqual(started.providerId, "r");
    assert.strictEqual(started.status, "ready", started.message);
    assert.strictEqual(started.connection, "runtime-control");
    assert.match(started.message, /R runtime-control session is attached/);
    const stopped = await manager.stop();
    assert.strictEqual(stopped.providerId, "r");
    assert.strictEqual(stopped.status, "stopped");
    assert.strictEqual(stopped.connection, "runtime-control");
};
verifyRProcessLifecycle()
    .then(() => {
    console.log("R process lifecycle contract verified.");
})
    .catch((error) => {
    console.error(error);
    process.exit(1);
});

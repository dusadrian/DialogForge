"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { getRuntimeProvider } = require("../../shared/runtime/providers/runtimeProviderRegistry");
const { createRuntimeSessionManager } = require("../../shared/runtime/session/runtimeSessionManager");
const { collectLinuxOptExecutableCandidates } = require("../../shared/runtime/providers/r/session/rBinaryDiscovery");
const verifyLocalRExists = function () {
    execFileSync("R", ["--version"], {
        stdio: "ignore"
    });
};
const verifyLinuxOptDiscovery = function () {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-opt-r-"));
    const binaryPath = path.join(root, "4.6.0", "bin", "R");

    try {
        fs.mkdirSync(path.dirname(binaryPath), { recursive: true });
        fs.writeFileSync(binaryPath, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
        assert.ok(
            collectLinuxOptExecutableCandidates("R", root).includes(binaryPath),
            "Linux R discovery must inspect versioned installations under /opt/R"
        );
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
};
const verifyRProcessLifecycle = async function () {
    verifyLinuxOptDiscovery();
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

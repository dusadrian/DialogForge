"use strict";

const assert = require("node:assert/strict");
const {
    createRuntimeLifecycleComposition
} = require("../dist/src/shell-electron/lifecycle/runtimeLifecycleComposition");


const main = async function() {
    for (const status of ["ready", "failed"]) {
        const snapshot = { providerId: "r", status, lifecycleGeneration: 1 };
        const delivered = [];
        let releaseBaseline;
        const baseline = new Promise((resolve) => { releaseBaseline = resolve; });
        const composition = {
            productSettings: {
                runtimeStartup: { autoStart: true, providerId: "r", restoreWorkspaceOnStart: false }
            }
        };
        const controller = createRuntimeLifecycleComposition({
            composition,
            productId: "base",
            runtimeId: "r",
            runtimeSessionManager: {
                start: async () => snapshot,
                executeRuntimeMethod: async () => {
                    await baseline;
                    return { status: "ready", value: { fingerprint: "empty" } };
                }
            },
            appendBootLog: () => {},
            sendRuntimeSession: (value) => delivered.push(value)
        });
        const started = controller.autoStartRuntime();
        await Promise.resolve();

        assert.deepEqual(delivered, [snapshot], `${status} must reach the renderer before baseline work`);
        assert.equal(composition.runtimeSession, snapshot);
        releaseBaseline();
        await started;
        assert.equal(delivered.length, 1);
    }
    console.log("Native startup session delivery cases passed.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

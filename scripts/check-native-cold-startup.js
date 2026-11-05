"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dist = path.resolve(process.env.DIALOGFORGE_DIST_DIR || path.join(__dirname, "../dist"));
const { createRRuntimeLaunchPlan } = require(path.join(dist, "src/runtime/providers/r/session/runtimeLaunchPlan"));
const { createRRuntimeProcessController } = require(path.join(dist, "src/runtime/providers/r/session/runtimeProcessController"));

const main = async function() {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-cold-start-"));
    const profile = path.join(temporary, "startup.R");
    // Cross the former seven-second deadline without depending on CPU speed.
    // The real launcher still compiles canonical sources and negotiates its
    // native helper, bounded input and ordered output before becoming ready.
    fs.writeFileSync(profile, "Sys.sleep(8)\n");
    const controller = createRRuntimeProcessController({
        createLaunchPlan: () => createRRuntimeLaunchPlan({
            rootDir: dist,
            sessionKind: "dedicated",
            profileRuntimeControlPath: profile,
            env: {
                ...process.env,
                DM_RUNTIME_CONTROL_COMPILATION_CACHE: path.join(temporary, "missing-cache.rds")
            }
        })
    });
    const snapshot = { providerId: "r", status: "not-started" };
    const started = Date.now();
    try {
        const ready = await controller.lifecycleController.start(snapshot);
        assert.equal(ready.status, "ready", ready.message);
        assert.ok(Date.now() - started >= 8000, "Cold startup must cross the former deadline.");
        console.log(`Native uncached startup passed (${Date.now() - started} ms).`);
    } finally {
        await controller.lifecycleController.stop(snapshot);
        fs.rmSync(temporary, { recursive: true, force: true });
    }
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

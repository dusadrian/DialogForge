"use strict";

// Explicitly authorized integration check only. Opens a disposable native help
// process and compares HTTP delivery with the worker adapter's generated R.
// It does not claim execution in WebR or rendered help parity.
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { createRHelpServer } = require("../dist/src/runtime/providers/r/help/rHelpServer");
const { createRHelpPageProxy } = require("../dist/src/runtime/providers/r/help/rHelpPageProxy");
const { createNodeResourceClient } = require("../dist/src/core/host/nodeResourceClient");
const { buildWebRHelpResourceCommand } = require("../dist/src/runtime/providers/webr/webRHelpResourceTransport");
const { createWebRHelpPageReader } = require("../dist/src/runtime/providers/webr/webRHelpDocument");

const main = async function() {
    const command = process.env.DIALOGFORGE_TEST_RSCRIPT || "Rscript";
    const help = createRHelpServer({ findRScriptBinary: async () => command });
    const native = createRHelpPageProxy({
        rewriteUrl: help.rewriteUrl, captureOwner: help.captureOwner,
        resourceClient: createNodeResourceClient()
    });
    const prelude = path.join(__dirname, "../src/runtime/providers/r/r-sources/runtimePrelude.R");
    const worker = createWebRHelpPageReader("http://localhost", async (evaluation) => {
        const execution = spawnSync(command, ["-e", [
            'attach(NULL, name = "DialogApp", warn.conflicts = FALSE)',
            'runtime <- as.environment("DialogApp")',
            'runtime$opts <- list()',
            `source(${JSON.stringify(prelude)}, local = runtime)`,
            evaluation
        ].join("\n")], { cwd: os.homedir(), encoding: "utf8", timeout: 15000, maxBuffer: 16 * 1024 * 1024 });
        assert.equal(execution.error, undefined);
        assert.equal(execution.status, 0, execution.stderr);
        return execution.stdout;
    });

    try {
        for (const pathname of ["/doc/html/R.css", "/favicon.ico", "/library/base/html/names.html"]) {
            const actual = await native.fetchResource(`http://localhost${pathname}`);
            const adapted = await worker.fetchResource(`http://localhost${pathname}`);
            assert.equal(actual.ok, true, actual.error);
            assert.equal(adapted.ok, true, adapted.error);
            assert.equal(adapted.status, actual.status);
            assert.equal(adapted.contentType, actual.contentType);
            assert.deepEqual(adapted.body, actual.body, `Exact resource bytes: ${pathname}`);
        }
        assert.ok(buildWebRHelpResourceCommand("/favicon.ico").includes('base::readBin('));
    } finally {
        await help.stop();
    }
    console.log("Native HTTP and generated worker-adapter R resource bytes agree; actual WebR/rendered acceptance remains open.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

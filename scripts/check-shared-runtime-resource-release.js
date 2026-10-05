"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { releaseOwnedRuntimeResource } = require("../dist/src/runtime/session/runtimeResourceRelease");

const main = async function() {
    for (const host of ["r", "webr"]) {
        for (const replaced of [false, true]) {
            const resource = { id: `${host}-old` };
            const replacement = { id: `${host}-new` };
            let current = resource;
            let finish;
            const pending = new Promise((resolve) => { finish = resolve; });
            const released = [];
            const disposed = [];
            const cleared = [];
            const release = releaseOwnedRuntimeResource({
                resource,
                release: async function(owned) {
                    released.push(owned);
                    await pending;
                    assert.equal(owned, resource, "Cleanup must not re-read the live resource after waiting.");
                },
                disposeReleased: (owned) => { disposed.push(owned); },
                isCurrent: (owned) => current === owned,
                clearCurrent: function(owned) { cleared.push(owned); current = null; }
            });
            if (replaced) {
                current = replacement;
            }
            finish();
            assert.equal(await release, !replaced);
            assert.deepEqual(released, [resource]);
            assert.deepEqual(disposed, [resource], "The old resource's private registrations are still disposed.");
            assert.deepEqual(cleared, replaced ? [] : [resource]);
            assert.equal(current, replaced ? replacement : null);
        }

        let cleared = false;
        await assert.rejects(releaseOwnedRuntimeResource({
            resource: {},
            release: async function() { throw new Error("physical release failed"); },
            isCurrent: () => true,
            clearCurrent: () => { cleared = true; }
        }), /physical release failed/);
        assert.equal(cleared, false, "Failed physical release must not pretend ownership was cleared.");
    }

    for (const relativePath of [
        "src/runtime/providers/r/session/runtimeProcessHost.ts",
        "src/shell-web/pages/shell.js"
    ]) {
        const source = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
        assert.ok(source.includes("releaseOwnedRuntimeResource("));
    }
    console.log("Shared resource release cases passed; physical shutdown/restart acceptance remains open.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

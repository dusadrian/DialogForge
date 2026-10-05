"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const childProcess = require("node:child_process");
const originalSpawn = childProcess.spawn;
const children = [];
childProcess.spawn = function() {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.pid = undefined; // Never target a real process, even if termination is called.
    child.killed = false;
    child.exitCode = null;
    child.signalCode = null;
    children.push(child);
    return child;
};
const { createRHelpServer } = require("../dist/src/runtime/providers/r/help/rHelpServer");

const waitForChild = async function(count) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        if (children.length >= count) {
            return children[count - 1];
        }
        await Promise.resolve();
    }
    assert.fail("Expected help process was not allocated.");
};

const main = async function() {
    try {
        let releaseBinary;
        const binary = new Promise((resolve) => { releaseBinary = resolve; });
        const retired = createRHelpServer({ findRScriptBinary: () => binary });
        const startup = retired.start();
        const rejected = assert.rejects(startup, /retired/);
        await retired.stop();
        releaseBinary("/fixture/Rscript");
        await rejected;
        assert.equal(children.length, 0, "Stopped binary discovery cannot launch a late help process.");

        let resolveReplacementBinary;
        const replacementBinary = new Promise((resolve) => { resolveReplacementBinary = resolve; });
        let discoveries = 0;
        const server = createRHelpServer({
            findRScriptBinary: function() {
                discoveries += 1;
                return discoveries === 1 ? Promise.resolve("/fixture/Rscript") : replacementBinary;
            }
        });
        const firstStart = server.start();
        assert.equal(server.captureOwner()(), false);
        const firstChild = await waitForChild(1);
        firstChild.stdout.emit("data", "DM_HELP_PORT=22101\n");
        assert.equal(await firstStart, 22101);
        const firstOwner = server.captureOwner();
        assert.equal(firstOwner(), true);

        const stopping = server.stop();
        assert.equal(firstOwner(), false);
        const replacementStart = server.start();
        firstChild.exitCode = 0;
        firstChild.emit("exit", 0);
        const joined = server.start();
        assert.equal(discoveries, 2, "An old exit cannot clear the replacement's pending startup.");
        resolveReplacementBinary("/fixture/Rscript");
        const replacementChild = await waitForChild(2);
        replacementChild.stdout.emit("data", "DM_HELP_PORT=22102\n");
        assert.equal(await replacementStart, 22102);
        assert.equal(server.captureOwner()(), true);
        assert.equal(firstOwner(), false, "Old resource receipts cannot acquire the replacement process.");
        assert.equal(await joined, 22102);
        await stopping;
        firstChild.emit("error", new Error("obsolete help process error"));
        assert.equal(await server.start(), 22102, "Old error cleanup cannot reset the replacement port.");
        assert.equal(children.length, 2);
        await server.stop();
        replacementChild.exitCode = 0;
        replacementChild.emit("exit", 0);
    } finally {
        childProcess.spawn = originalSpawn;
    }
    console.log("Native help process ownership cases passed; actual help/window acceptance remains open.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

"use strict";

const assert = require("node:assert/strict");
const { createConsoleStartupOutputController } = require("../dist/src/console/renderer/consoleStartupOutputController");

for (const quiet of [true, false]) {
    for (const readyBeforeRenderer of [true, false]) {
        let session = { providerId: "r", status: "starting", lifecycleGeneration: 1 };
        const output = [];
        const controller = createConsoleStartupOutputController({
            getSession: () => session,
            appendOutput: text => output.push(text)
        });
        const ready = { ...session, status: "ready", startupOutput: "R version actual-banner\nCopyright and startup messages" };
        if (readyBeforeRenderer) {
            session = ready;
            controller.observe(session);
        }
        controller.configure(!quiet);
        assert.equal(output.length, 0, "Wait for the initialized console transcript.");
        controller.outputReady();
        if (!readyBeforeRenderer) {
            session = ready;
            controller.observe(session);
        }
        controller.observe(session);
        assert.deepEqual(output, quiet ? [] : [ready.startupOutput],
            "Honor quiet startup and present the full captured banner exactly once.");
    }
}

{
    let session = { providerId: "r", status: "ready", lifecycleGeneration: 1, startupOutput: "Retired banner" };
    const output = [];
    const controller = createConsoleStartupOutputController({
        getSession: () => session, appendOutput: text => output.push(text)
    });
    controller.observe(session);
    session = { ...session, lifecycleGeneration: 2, status: "starting" };
    controller.configure(true);
    controller.outputReady();
    assert.deepEqual(output, [], "Do not show a buffered retired session's banner.");
    session = { ...session, status: "ready", startupOutput: "Current banner" };
    controller.observe(session);
    assert.deepEqual(output, ["Current banner"]);
}

console.log("Quiet/nonquiet startup, early/late readiness, duplicate and retired-banner cases passed.");

"use strict";

const assert = require("node:assert/strict");
const { createMainProductCommandController } = require("../dist/src/base-app/features/menu-commands/mainProductCommandController");
const { selectRDevelopmentPackages } = require("../dist/src/runtime/providers/r/dependencies/packageInstallWorkflow");

const main = async function() {
    for (const host of ["r", "webr"]) {
        const calls = [];
        const controller = createMainProductCommandController({
            getProductId: () => "fixture",
            getProductCapabilities: () => [{ capability: "analysis", rPackages: ["declared"] }],
            installRequired: async (names) => { calls.push(["install", names]); },
            updateRequired: async (names) => { calls.push(["update", names]); },
            executeProductCommand: async (request) => {
                calls.push(["command", request.command, request.rPackages]);
                return { status: "ready", command: request.command };
            },
            renderResult: (result) => { calls.push(["render", result.command]); },
            refreshRuntimeEvents: () => { calls.push(["events"]); },
            checkDependencies: async (names) => { calls.push(["check", names]); }
        });

        await controller.execute({ command: "fixture.packages.installRequired", capability: "analysis" });
        await controller.execute({ command: "fixture.packages.updateRequired", rPackages: ["declared"] });
        await controller.execute({ command: "fixture.analysis", rPackages: ["declared"] });
        assert.deepEqual(calls, [
            ["install", ["declared"]], ["update", ["declared"]],
            ["command", "fixture.analysis", ["declared"]],
            ["render", "fixture.analysis"], ["events"], ["check", ["declared"]]
        ], host);
    }

    assert.deepEqual(selectRDevelopmentPackages(["QCA", "declared", "stats"]), ["declared", "QCA"]);
    assert.deepEqual(selectRDevelopmentPackages(["declared", "QCA", "stats"], {
        cran: ["declared"], runiverse: ["QCA"]
    }), ["QCA"], "Explicit product sources override the development defaults.");
    console.log("Shared product dispatch cases passed; rendered package menus remain unverified.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

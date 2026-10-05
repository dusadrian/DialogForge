"use strict";

const assert = require("node:assert/strict");
const {
    createRPackageInstallWorkflow
} = require("../dist/src/runtime/providers/r/dependencies/packageInstallWorkflow");
const {
    createRPackageInstallPrompts
} = require("../dist/src/runtime/providers/r/dependencies/packageInstallPrompts");
const {
    createRRuntimePackageStatusCommand,
    parseRRuntimePackageStatus
} = require("../dist/src/runtime/providers/r/dependencies/runtimePackageRequirements");

const checkWorkflow = async function(host, outcome, mode) {
    let manager = {};
    const events = [];
    const workflow = createRPackageInstallWorkflow({
        getRuntimeSnapshot: () => ({ status: "ready", providerId: "r", lifecycleGeneration: 1 }),
        getRuntimeIdentity: () => manager,
        getProductId: () => "fixture",
        getInstallDependencies: () => host === "native",
        ensureRuntime: async () => { events.push("startup"); },
        executeQuery: async (command) => {
            if (command.includes(".versions")) {
                events.push("verify-installed");
                if (outcome === "post-install-retired") {
                    manager = {};
                }
                if (outcome === "post-install-exception") {
                    throw Error("Verification query failed");
                }
                return { status: outcome === "post-install-unavailable" ? "failed" : "ready",
                    value: outcome === "post-install-missing" ? "declared\t<missing>"
                        : outcome === "post-install-incomplete" ? ""
                            : outcome === "post-install-foreign" ? "admisc\t0.27" : "declared\t0.27" };
            }
            return { status: "ready", value: command.includes(".loaded_namespaces")
                ? (outcome === "invalid" ? "foreign" : "declared")
                : "1\t/user/library\t/default/library" };
        },
        confirmRestart: async () => {
            events.push("restart-choice");
            return { action: outcome === "cancel-restart" ? "cancel" : "clean" };
        },
        restartRuntime: async () => {
            manager = {};
            events.push("restart");
            return { status: "ready", providerId: "r", lifecycleGeneration: 1 };
        },
        chooseLibrary: async () => {
            events.push("library-choice");
            return { action: outcome === "cancel-library" ? "cancel" : "user" };
        },
        executeVisibleCommand: async (command, source) => {
            events.push("install");
            assert.equal(source, "fixture.packages." + (mode === "update" ? "updateRequired" : "installRequired"));
            assert.equal(command.includes("dependencies = TRUE"), mode !== "update" && host === "native");
            assert.ok(command.includes('.library <- "/user/library"'));
            assert.ok(command.includes("lib = .stage"));
            if (outcome === "failed") {
                throw new Error("installation failed");
            }
            if (outcome === "replaced") {
                manager = {};
            }
            if (outcome === "missing-receipt") {
                return null;
            }
            const transcript = outcome === "transcript-failure"
                ? [{ type: "failed", message: "Package install transcript failure" }]
                : outcome === "rejected"
                    ? [{ type: "rejected", message: "Package install rejected" }]
                    : [];
            return host === "native" ? transcript : {
                ok: outcome !== "rejected",
                transcriptEvents: transcript
            };
        },
        packagesInstalled: (names) => {
            assert.deepEqual(names, ["declared"]);
            events.push("accepted");
        }
    });

    await workflow.installRequired([]);
    assert.deepEqual(events, [], "Empty requests neither start R nor ask questions.");
    const run = mode === "update" ? workflow.updateRequired : workflow.installRequired;
    if (["invalid", "failed", "replaced", "transcript-failure", "rejected", "missing-receipt",
        "post-install-missing", "post-install-incomplete", "post-install-retired",
        "post-install-unavailable", "post-install-exception", "post-install-foreign"].includes(outcome)) {
        await assert.rejects(run(["declared"]));
        assert.ok(!events.includes("accepted"));
    } else {
        await run(["declared"]);
        assert.equal(events.includes("accepted"), outcome === "ready");
    }
    if (outcome === "cancel-restart") {
        assert.deepEqual(events, ["startup", "restart-choice"]);
    }
    if (outcome === "cancel-library") {
        assert.deepEqual(events, ["startup", "restart-choice", "restart", "library-choice"]);
    }
    if (outcome === "ready") {
        assert.ok(events.indexOf("install") < events.indexOf("verify-installed"));
        assert.ok(events.indexOf("verify-installed") < events.indexOf("accepted"));
    }
};

const main = async function() {
    const statusCommand = createRRuntimePackageStatusCommand(["declared", "AbsentFixture"]);
    assert.match(statusCommand, /length\(find\.package\(\.pkg, quiet = TRUE\)\) > 0L/,
        "Absent packages must produce one FALSE value, not logical(0).");
    assert.deepEqual(parseRRuntimePackageStatus("AbsentFixture|declared",
        ["declared", "AbsentFixture"]), {
        missing: ["AbsentFixture"], attached: ["declared"]
    });
    for (const host of ["native", "worker"]) {
        for (const outcome of [
            "ready", "cancel-restart", "cancel-library", "invalid", "failed",
            "replaced", "transcript-failure", "rejected", "missing-receipt",
            "post-install-missing", "post-install-incomplete", "post-install-retired",
            "post-install-unavailable", "post-install-exception", "post-install-foreign"
        ]) {
            for (const mode of ["install", "update"]) {
                await checkWorkflow(host, outcome, mode);
            }
        }
    }
    for (const response of [0, 1, 2, 99]) {
        const prompts = createRPackageInstallPrompts({
            translate: (text) => text,
            showMessageBox: async (prompt) => {
                assert.equal(prompt.cancelId, 0);
                assert.equal(prompt.buttons.length, 3);
                return { response };
            }
        });
        assert.equal((await prompts.confirmRestart({ packages: ["declared"] })).action,
            ["cancel", "clean", "restore"][response] || "cancel");
        assert.equal((await prompts.chooseLibrary({ userLibrary: "/user", defaultLibrary: "/default" })).action,
            ["cancel", "user", "default"][response] || "cancel");
    }
    console.log("Shared package installation workflow and prompt cases passed.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

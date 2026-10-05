"use strict";

const assert = require("node:assert/strict");
const { createRuntimeSessionLifecycleState } = require("../dist/src/runtime/session/runtimeSessionLifecycleState");
const { captureRPackageRuntime } = require("../dist/src/runtime/providers/r/dependencies/rPackageRuntimeGuard");
const { loadRequiredRPackages } = require("../dist/src/runtime/providers/r/dependencies/rPackageAttachment");
const { prepareRequiredRPackages } = require("../dist/src/runtime/providers/r/dependencies/rPackageRequirementReadiness");
const { createWebRRuntimePackageAdapter } = require("../dist/src/runtime/providers/webr/webRRuntimePackageAdapter");
const { createRPackageInstallWorkflow } = require("../dist/src/runtime/providers/r/dependencies/packageInstallWorkflow");

const main = async function() {
    for (const host of ["r", "webr"]) {
        const lifecycle = createRuntimeSessionLifecycleState({
            providerId: host, status: "ready", connection: "fixture", message: "Ready"
        });
        let runtime = { getSnapshot: lifecycle.getSnapshot };
        const current = captureRPackageRuntime(() => runtime);
        assert.equal(current(), true);
        const nextGeneration = lifecycle.beginTransition();
        lifecycle.commit(nextGeneration, { ...lifecycle.getSnapshot(), lifecycleGeneration: 999 });
        assert.equal(lifecycle.getSnapshot().lifecycleGeneration, nextGeneration,
            "Provider snapshots cannot forge the shared lifecycle generation.");
        assert.equal(current(), false);
        const replacement = captureRPackageRuntime(() => runtime);
        runtime = { getSnapshot: lifecycle.getSnapshot };
        assert.equal(replacement(), false, "Equal snapshot fields do not make a replaced manager the same runtime.");

        const mutableSnapshot = { status: "ready", lifecycleGeneration: 1 };
        const mutableRuntime = { getSnapshot: () => mutableSnapshot };
        const mutableCurrent = captureRPackageRuntime(() => mutableRuntime);
        mutableSnapshot.lifecycleGeneration += 1;
        assert.equal(mutableCurrent(), false, "Capture generation values, not a mutable snapshot reference.");

        let live = true;
        const attached = [];
        const ready = [];
        await assert.rejects(loadRequiredRPackages(["declared"], {
            isCurrent: () => live,
            readStatus: async () => { live = false; return "|"; },
            attach: async (name) => { attached.push(name); },
            packageReady: (name) => { ready.push(name); }
        }), /Runtime session changed/);
        assert.deepEqual(attached, []);
        assert.deepEqual(ready, []);

        live = true;
        await assert.rejects(loadRequiredRPackages(["declared", "later"], {
            isCurrent: () => live,
            readStatus: async () => "|",
            attach: async (name) => { attached.push(name); live = false; },
            packageReady: (name) => { ready.push(name); }
        }), /Runtime session changed/);
        assert.deepEqual(attached, ["declared"]);
        assert.deepEqual(ready, [], "Retired attachment must not mark replacement-session packages ready.");

        live = true;
        let loaded = false;
        const readiness = await prepareRequiredRPackages([{ name: "declared" }], {
            isCurrent: () => live,
            readVersions: async () => { live = false; return { ok: true, value: "declared\t1.0.0" }; },
            loadPackages: async () => { loaded = true; return { ok: true, error: "" }; }
        });
        assert.equal(readiness.ok, false);
        assert.match(readiness.error, /Runtime session changed/);
        assert.equal(loaded, false);
    }

    let generation = 1;
    let attachmentRefreshes = 0;
    const adapter = createWebRRuntimePackageAdapter({
        getRuntime: () => manager,
        getProductId: () => "fixture",
        chooseInstallLibrary: async () => ({ action: "default" }),
        confirmInstallRestart: async () => ({ action: "cancel" }),
        restartForInstall: async () => manager.getSnapshot(),
        createActivity: () => ({ id: "fixture" }), finishActivity() {},
        recordRuntimeMessageStream() {},
        packagesLoaded: async () => { attachmentRefreshes += 1; },
        ensureRuntime: async () => {},
        evaluateHiddenText: async (command) => command.includes(".loaded_namespaces")
            ? "" : command.includes(".installed") ? "|" : "0\t/user\t/default",
        executeVisibleCommand: async () => { generation += 1; return { ok: true }; }
    });
    const manager = { getSnapshot: () => ({ status: "ready", lifecycleGeneration: generation }) };
    await assert.rejects(adapter.installSessionPackages(["declared"]), /Runtime session changed/);
    assert.equal(attachmentRefreshes, 0,
        "Retired installation cannot refresh replacement-session attachments.");

    for (const stage of ["loaded-query", "restart-choice", "library-query", "library-choice", "installation", "verification", "intentional-restart"]) {
        let current = { status: "ready", providerId: "r", lifecycleGeneration: 1 };
        let queries = 0;
        let installs = 0;
        const workflow = createRPackageInstallWorkflow({
            getRuntimeSnapshot: () => current,
            getProductId: () => "fixture",
            executeQuery: async () => {
                queries += 1;
                if (stage === "loaded-query" || (stage === "library-query" && queries === 2)
                    || (stage === "verification" && queries === 3)) {
                    current = { ...current, lifecycleGeneration: 2 };
                }
                return { status: "ready", value: queries === 1
                    ? (stage === "restart-choice" || stage === "intentional-restart" ? "declared" : "")
                    : queries === 2 ? "1\t/user/library\t/default/library" : "declared\t0.27" };
            },
            confirmRestart: async () => {
                if (stage === "restart-choice") {
                    current = { ...current, lifecycleGeneration: 2 };
                }
                return { action: "clean" };
            },
            restartRuntime: async () => {
                current = { ...current, lifecycleGeneration: 2 };
                return current;
            },
            chooseLibrary: async () => {
                if (stage === "library-choice") {
                    current = { ...current, lifecycleGeneration: 2 };
                }
                return { action: "user" };
            },
            executeVisibleCommand: async () => {
                installs += 1;
                if (stage === "installation") {
                    current = { ...current, lifecycleGeneration: 2 };
                }
                return { ok: true };
            }
        });
        if (stage === "intentional-restart") {
            await workflow.installRequired(["declared"]);
            assert.equal(installs, 1, "The requested ready restart establishes the new installation scope.");
        }
        else {
            await assert.rejects(workflow.installRequired(["declared"]), /Runtime session changed/, stage);
            assert.equal(installs, stage === "installation" || stage === "verification" ? 1 : 0, stage);
        }
    }
    console.log("Shared package runtime guards passed; native/WebR package dialog acceptance remains open.");
};
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

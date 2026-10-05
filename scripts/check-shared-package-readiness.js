"use strict";

const assert = require("node:assert/strict");
const { createRPackagePreparationController, createRPackageRuntimeStartupReceipt, prepareRequiredRPackages, readRPackageRequirementReadiness } = require("../dist/src/runtime/providers/r/dependencies/rPackageRequirementReadiness");
const { createRPackageVersionsCommand } = require("../dist/src/runtime/providers/r/dependencies/rPackageCompatibility");
const { createWebRRuntimePackageAdapter } = require("../dist/src/runtime/providers/webr/webRRuntimePackageAdapter");

const main = async function() {
    assert.ok(createRPackageVersionsCommand([{ name: "declared" }])
        .includes("base::requireNamespace(.pkg, quietly = TRUE)"),
    "Readiness inspection must not use WebR/user auto-install shims.");
    const requirements = [{ name: "declared", minimumVersion: "0.25" }];

    for (const host of ["r", "webr"]) {
        let coldRuntime = null;
        let coldStarts = 0;
        const coldPreparation = createRPackagePreparationController({
            getRuntime: () => coldRuntime,
            ensureRuntime: async function() {
                coldStarts += 1;
                coldRuntime = { getSnapshot: () => ({ status: "ready", providerId: host, lifecycleGeneration: 1 }) };
                return createRPackageRuntimeStartupReceipt(coldRuntime);
            }
        });
        assert.equal(await coldPreparation.prepare(requirements, async () => "created"), "created");
        assert.equal(coldStarts, 1, "A deliberately created ready manager is not a retired pre-start manager.");

        let retiredColdRuntime = null;
        let enteredColdPreparation = false;
        const retiredColdPreparation = createRPackagePreparationController({
            getRuntime: () => retiredColdRuntime,
            ensureRuntime: async function() {
                const started = { getSnapshot: () => ({ status: "ready", providerId: host, lifecycleGeneration: 1 }) };
                const receipt = createRPackageRuntimeStartupReceipt(started);
                retiredColdRuntime = { ...started };
                return receipt;
            }
        });
        await assert.rejects(retiredColdPreparation.prepare(requirements, async () => {
            enteredColdPreparation = true;
        }), /Runtime session changed/);
        assert.equal(enteredColdPreparation, false);

        let dispatchGeneration = 1;
        let startupDispatched = false;
        const dispatchRuntime = { getSnapshot: () => ({ status: "stopped", providerId: host,
            lifecycleGeneration: dispatchGeneration }) };
        const dispatchPreparation = createRPackagePreparationController({
            getRuntime: () => dispatchRuntime,
            ensureRuntime: async function() { startupDispatched = true; }
        });
        const beforeDispatch = dispatchPreparation.prepare(requirements, async () => "retired");
        dispatchGeneration += 1;
        await assert.rejects(beforeDispatch, /Runtime session changed/);
        assert.equal(startupDispatched, false, "A queued startup cannot act on a retired lifecycle phase.");

        let receiptGeneration = 1;
        let retiredGenerationRuntime = null;
        const retiredGenerationPreparation = createRPackagePreparationController({
            getRuntime: () => retiredGenerationRuntime,
            ensureRuntime: async function() {
                retiredGenerationRuntime = { getSnapshot: () => ({ status: "ready", providerId: host,
                    lifecycleGeneration: receiptGeneration }) };
                const receipt = createRPackageRuntimeStartupReceipt(retiredGenerationRuntime);
                receiptGeneration += 1;
                return receipt;
            }
        });
        await assert.rejects(retiredGenerationPreparation.prepare(requirements, async () => "wrong generation"), /Runtime session changed/);

        let phase = "not-started";
        let generation = 0;
        let startupCalls = 0;
        let releaseStartup;
        let startupStarted;
        const startupBegan = new Promise((resolve) => { startupStarted = resolve; });
        const startupGate = new Promise((resolve) => { releaseStartup = resolve; });
        const runtime = { getSnapshot: () => ({ status: phase, lifecycleGeneration: generation }) };
        const scoped = createRPackagePreparationController({
            getRuntime: () => runtime,
            ensureRuntime: async () => {
                startupCalls += 1;
                generation += 1;
                phase = "starting";
                startupStarted();
                await startupGate;
                phase = "ready";
            }
        });
        let scopedCalls = 0;
        const preparing = async () => { scopedCalls += 1; return "ready"; };
        const startupFirst = scoped.prepare(requirements, preparing);
        const startupSecond = scoped.prepare(requirements, preparing);
        await startupBegan;
        assert.equal(startupCalls, 1, "Both host paths must share required startup.");
        releaseStartup();
        assert.deepEqual(await Promise.all([startupFirst, startupSecond]), ["ready", "ready"]);
        assert.equal(scopedCalls, 1);
        await scoped.prepare(requirements, preparing);
        assert.equal(startupCalls, 1, "Preparing packages must not restart an already ready runtime.");

        let releaseRetired;
        let retiredStarted;
        const retiredBegan = new Promise((resolve) => { retiredStarted = resolve; });
        const retiredGate = new Promise((resolve) => { releaseRetired = resolve; });
        const retired = scoped.prepare(requirements, async () => {
            retiredStarted(); await retiredGate; return "retired";
        });
        const retiredRejected = assert.rejects(retired, /Runtime session changed/);
        await retiredBegan;
        generation += 1;
        assert.equal(await scoped.prepare(requirements, async () => "replacement"), "replacement",
            "Replacement generation cannot join retired preparation.");
        releaseRetired();
        await retiredRejected;

        let currentRuntime = { getSnapshot: () => ({ status: "starting" }) };
        const originalRuntime = currentRuntime;
        let releaseOriginalStartup;
        let originalStartupStarted;
        const originalStartupBegan = new Promise((resolve) => { originalStartupStarted = resolve; });
        const originalStartupGate = new Promise((resolve) => { releaseOriginalStartup = resolve; });
        const replacementScoped = createRPackagePreparationController({
            getRuntime: () => currentRuntime,
            ensureRuntime: async () => {
                const startingRuntime = currentRuntime;
                if (startingRuntime === originalRuntime) {
                    originalStartupStarted();
                    await originalStartupGate;
                }
                startingRuntime.getSnapshot = () => ({ status: "ready" });
            }
        });
        let oldPreparationCalls = 0;
        const originalStartup = replacementScoped.prepare(requirements, async () => {
            oldPreparationCalls += 1;
        });
        const originalRejected = assert.rejects(originalStartup, /Runtime session changed/);
        await originalStartupBegan;
        currentRuntime = { getSnapshot: () => ({ status: "starting" }) };
        assert.equal(await replacementScoped.prepare(requirements, async () => "new runtime"), "new runtime",
            "A replacement manager must not wait for or join an old manager's startup.");
        releaseOriginalStartup();
        await originalRejected;
        assert.equal(oldPreparationCalls, 0, "Retired startup cannot enter package preparation.");

        const unavailableRuntime = { getSnapshot: () => ({ status: "starting" }) };
        const notReady = createRPackagePreparationController({
            getRuntime: () => unavailableRuntime,
            ensureRuntime: async () => {}
        });
        await assert.rejects(notReady.prepare(requirements, async () => {
            throw new Error("Must not prepare against a non-ready runtime");
        }), /R runtime is not ready/);

        const preparation = createRPackagePreparationController();
        let releasePreparation;
        const gate = new Promise((resolve) => { releasePreparation = resolve; });
        let preparationCalls = 0;
        const prepare = async function() {
            preparationCalls += 1;
            await gate;
            return { ok: true, error: "" };
        };
        const ordered = [...requirements, { name: "admisc" }];
        const first = preparation.prepare(ordered, prepare);
        const second = preparation.prepare([...ordered].reverse(), prepare);
        await Promise.resolve();
        assert.equal(preparationCalls, 1, "Equivalent in-flight requirements share preparation.");
        releasePreparation();
        assert.deepEqual(await first, await second);
        await preparation.prepare(ordered, prepare);
        assert.equal(preparationCalls, 2, "Successful preparation is not retained.");
        await assert.rejects(preparation.prepare(ordered, async () => {
            throw new Error("preparation failed");
        }), /preparation failed/);
        assert.deepEqual(await preparation.prepare(ordered, async () => ({ ok: true })), { ok: true });
        let distinctCalls = 0;
        await Promise.all([
            preparation.prepare(requirements, async () => { distinctCalls += 1; }),
            preparation.prepare([{ ...requirements[0], minimumVersionExclusive: true }],
                async () => { distinctCalls += 1; })
        ]);
        assert.equal(distinctCalls, 2, "Different version constraints must not share preparation.");

        const commands = [];
        let version = "0.25";
        const read = async function(command) {
            commands.push(command);
            return { ok: true, value: `declared\t${version}` };
        };

        assert.equal((await readRPackageRequirementReadiness(requirements, read)).ok, true, host);
        version = "0.24";
        const changed = await readRPackageRequirementReadiness(requirements, read);
        assert.equal(changed.ok, false, host);
        assert.equal(changed.status, "r-package-update-required");
        assert.match(changed.error, /installed 0.24/);
        assert.equal(commands.length, 2, "Reinspect packages changed outside a menu.");
        assert.equal(commands[0], commands[1]);

        const strict = await readRPackageRequirementReadiness([
            { ...requirements[0], minimumVersionExclusive: true }
        ], async () => ({ ok: true, value: "declared\t0.25" }));
        assert.equal(strict.ok, false);
        const unavailable = await readRPackageRequirementReadiness(requirements,
            async () => ({ ok: false, error: "runtime detached" }));
        assert.deepEqual(unavailable, { ok: false, error: "runtime detached" });
        const missing = await readRPackageRequirementReadiness(requirements,
            async () => ({ ok: true, value: "declared\t<missing>" }));
        assert.equal(missing.status, "r-package-update-required");
        assert.match(missing.error, /not installed/);
        await assert.rejects(readRPackageRequirementReadiness(requirements,
            async () => { throw new Error("query failed"); }), /query failed/);
        assert.deepEqual(await readRPackageRequirementReadiness([], async () => {
            throw new Error("Empty requirements must not query R.");
        }), { ok: true, error: "" });

        const steps = [];
        const prepareBindings = {
            readVersions: async function() {
                steps.push("versions");
                return { ok: true, value: `declared\t${version}` };
            },
            loadPackages: async function(names) {
                steps.push("load");
                assert.deepEqual(names, ["declared"]);
                return { ok: false, error: "attachment rejected" };
            }
        };
        assert.equal((await prepareRequiredRPackages(requirements, prepareBindings)).ok, false);
        assert.deepEqual(steps, ["versions"], "Incompatible requirements never reach loading.");
        steps.length = 0;
        version = "0.25";
        assert.deepEqual(await prepareRequiredRPackages(requirements, prepareBindings),
            { ok: false, error: "attachment rejected" });
        assert.deepEqual(steps, ["versions", "load"], host);
        steps.length = 0;
        assert.deepEqual(await prepareRequiredRPackages([], prepareBindings), { ok: true, error: "" });
        assert.deepEqual(steps, []);
    }

    let version = "0.25";
    let versionReads = 0;
    let attachments = 0;
    let attachmentStatus = "|declared";
    const adapter = createWebRRuntimePackageAdapter({
        getProductId: () => "fixture",
        chooseInstallLibrary: async () => ({ action: "default" }),
        confirmInstallRestart: async () => ({ action: "cancel" }),
        restartForInstall: async () => ({ status: "ready" }),
        createActivity: () => ({ id: "fixture" }),
        finishActivity() {},
        recordRuntimeMessageStream() {},
        setRuntimeBusy() {
            assert.fail("Package preparation must not override the shared console busy owner.");
        },
        packagesLoaded: async () => {},
        ensureRuntime: async () => {},
        evaluateHiddenText: async function(command) {
            if (command.includes("utils::packageVersion")) {
                versionReads += 1;
                return `declared\t${version}`;
            }
            return attachmentStatus;
        },
        executeVisibleCommand: async function(_command, options) {
            assert.equal(options.preRecorded, undefined,
                "Shared executor/router owns the command echo on both hosts.");
            attachments += 1;
            return { ok: true };
        }
    });

    await adapter.ensureRequirements(requirements);
    version = "0.24";
    await assert.rejects(adapter.ensureRequirements(requirements), /Package update required/);
    assert.equal(versionReads, 2, "Browser adapter must not retain successful version checks.");
    version = "0.25";
    await Promise.all([
        adapter.ensureRequirements(requirements),
        adapter.ensureRequirements(requirements)
    ]);
    assert.equal(versionReads, 3, "Browser uses common in-flight preparation sharing.");
    assert.equal(attachments, 0, "Already attached packages need no library command.");
    attachmentStatus = "";
    await assert.rejects(adapter.ensureRequirements(requirements), /Invalid R package status response/);
    assert.equal(attachments, 0, "Malformed browser status must not attach packages.");
    attachmentStatus = "|declared";
    await adapter.ensureRequirements(requirements);
    console.log("Shared package readiness cases passed; real package and dialog workflows remain acceptance requirements.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});

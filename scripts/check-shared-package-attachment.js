"use strict";

const assert = require("node:assert/strict");
const {
    attachRequiredRPackages,
    loadRequiredRPackages,
    requireSuccessfulRPackageAttachment
} = require("../dist/src/runtime/providers/r/dependencies/rPackageAttachment");

const main = async function() {
    const readAttachedStatus = function(command, attached) {
        return "|" + Array.from(attached).filter(function(name) {
            return command.includes(JSON.stringify(name));
        }).join(",");
    };
    for (const host of ["r", "webr"]) {
        const receipt = function(events, ok = true) {
            return host === "r" ? events : { ok, transcriptEvents: events };
        };
        requireSuccessfulRPackageAttachment("declared", receipt([]), () => true);
        for (const failure of [
            { type: "failed", message: "Package attachment failed" },
            { type: "rejected", message: "Package request rejected" },
            { type: "error", message: "Package execution error" },
            { type: "output", state: "error", message: "Package output failure" }
        ]) {
            assert.throws(() => requireSuccessfulRPackageAttachment(
                "declared", receipt([failure]), () => true
            ), (error) => error.message === failure.message, host);
        }
        assert.throws(() => requireSuccessfulRPackageAttachment(
            "declared", receipt([]), () => false
        ), /Runtime session changed/, host);
        assert.throws(() => requireSuccessfulRPackageAttachment(
            "declared", receipt([{ type: "failed", message: "Retired failure" }]), () => false
        ), /Runtime session changed/, "Retirement takes precedence over old attachment errors.");

        if (host === "webr") {
            for (const invalidReceipt of [null, undefined, {}, { ok: false }]) {
                assert.throws(() => requireSuccessfulRPackageAttachment(
                    "declared", invalidReceipt
                ), /declared/, "Missing or unsuccessful attachment receipts must fail.");
            }
        }
        const calls = [];
        const ready = [];
        const attached = new Set(["already"]);
        const loaded = await attachRequiredRPackages(["already", "declared", "other"], {
            isAttached: async (name) => attached.has(name),
            attach: async (name, command) => { calls.push([name, command]); attached.add(name); },
            packageReady: (name) => { ready.push(name); }
        });
        assert.deepEqual(loaded, ["declared", "other"], host);
        assert.deepEqual(calls, [["declared", "library(declared)"], ["other", "library(other)"]]);
        assert.deepEqual(ready, ["already", "declared", "other"]);
        const attempted = [];
        await assert.rejects(attachRequiredRPackages(["fails", "later"], {
            isAttached: async () => false,
            attach: async function(name) {
                attempted.push(name);
                throw new Error("Fixture attachment failure");
            }
        }), /Fixture attachment failure/);
        assert.deepEqual(attempted, ["fails"], "Do not continue loading after failed attachment.");

        await assert.rejects(attachRequiredRPackages(["declared"], {
            isAttached: async () => false,
            attach: async () => {},
            packageReady: () => { assert.fail("An unattached package must not become ready."); },
            packagesLoaded: async () => { assert.fail("An unattached package must not publish a load."); }
        }), /Could not load R package: declared/);

        const silentAttached = new Set();
        const silentRefreshes = [];
        const silentReady = [];
        await assert.rejects(attachRequiredRPackages(["declared", "fails"], {
            isAttached: async name => silentAttached.has(name),
            attach: async name => { if (name === "declared") silentAttached.add(name); },
            packageReady: name => silentReady.push(name),
            packagesLoaded: async names => { silentRefreshes.push([...names]); }
        }), /Could not load R package: fails/);
        assert.deepEqual(silentReady, ["declared"]);
        assert.deepEqual(silentRefreshes, [["declared"]],
            "Silent later failure still reconciles the verified earlier load once.");

        let postLoadCurrent = true;
        let attachmentChecks = 0;
        await assert.rejects(attachRequiredRPackages(["declared"], {
            isCurrent: () => postLoadCurrent,
            isAttached: async function() {
                attachmentChecks++;
                if (attachmentChecks === 2) {
                    postLoadCurrent = false;
                    return true;
                }
                return false;
            },
            attach: async () => {},
            packageReady: () => { assert.fail("A retired verification must not publish readiness."); },
            packagesLoaded: async () => { assert.fail("A retired verification must not refresh its replacement."); }
        }), /Runtime session changed/);
        assert.equal(attachmentChecks, 2);

        const partialCalls = [];
        const partialAttached = new Set();
        const attachmentFailure = new Error("Second package failed");
        await assert.rejects(loadRequiredRPackages(["declared", "fails", "later"], {
            readStatus: async (command) => readAttachedStatus(command, partialAttached),
            attach: async function(name) {
                partialCalls.push(name);
                if (name === "fails") {
                    throw attachmentFailure;
                }
                partialAttached.add(name);
            },
            packagesLoaded: async function(names) {
                partialCalls.push(Array.from(names));
            }
        }), (error) => error === attachmentFailure);
        assert.deepEqual(partialCalls, ["declared", "fails", ["declared"]], host);

        const deliveryFailure = new Error("Workspace delivery failed");
        const deliveryAttached = new Set();
        await assert.rejects(loadRequiredRPackages(["declared", "fails"], {
            readStatus: async (command) => readAttachedStatus(command, deliveryAttached),
            attach: async function(name) {
                if (name === "fails") {
                    throw attachmentFailure;
                }
                deliveryAttached.add(name);
            },
            packagesLoaded: async () => { throw deliveryFailure; }
        }), function(error) {
            assert.ok(error instanceof AggregateError);
            assert.deepEqual(error.errors, [attachmentFailure, deliveryFailure]);
            assert.match(error.message, /Second package failed/);
            assert.match(error.message, /Workspace delivery failed/);
            return true;
        });

        let partialRuntimeCurrent = true;
        const retiredAttached = new Set();
        await assert.rejects(loadRequiredRPackages(["declared", "fails"], {
            isCurrent: () => partialRuntimeCurrent,
            readStatus: async (command) => readAttachedStatus(command, retiredAttached),
            attach: async function(name) {
                if (name === "fails") {
                    partialRuntimeCurrent = false;
                    throw attachmentFailure;
                }
                retiredAttached.add(name);
            },
            packagesLoaded: async () => { assert.fail("Retired partial loads must not refresh the new runtime."); }
        }), (error) => error === attachmentFailure);

        const queried = [];
        const loadedCommands = [];
        const refreshes = [];
        const statusAttached = new Set(["already"]);
        const statusLoaded = await loadRequiredRPackages(["already", "declared", "declared"], {
            readStatus: async function(command) {
                queried.push(command);
                return readAttachedStatus(command, statusAttached);
            },
            attach: async (name, command) => { loadedCommands.push([name, command]); statusAttached.add(name); },
            packagesLoaded: async (names) => { refreshes.push(Array.from(names)); }
        });
        assert.deepEqual(statusLoaded, ["declared"], host);
        assert.deepEqual(loadedCommands, [["declared", "library(declared)"]]);
        assert.equal(queried.length, 4);
        assert.match(queried[0], /find.package/);
        assert.match(queried[0], /search\(\)/);
        assert.deepEqual(refreshes, [["declared"]],
            "Only newly attached packages request shared completion delivery.");

        let current = true;
        await assert.rejects(loadRequiredRPackages(["declared"], {
            isCurrent: () => current,
            readStatus: async () => "|",
            attach: async () => { current = false; },
            packagesLoaded: async () => { throw new Error("Retired attachment must not refresh."); }
        }), /Runtime session changed/);
        current = true;
        const refreshAttached = new Set();
        await assert.rejects(loadRequiredRPackages(["declared"], {
            isCurrent: () => current,
            readStatus: async (command) => readAttachedStatus(command, refreshAttached),
            attach: async (name) => { refreshAttached.add(name); },
            packagesLoaded: async () => { current = false; }
        }), /Runtime session changed/);

        const missingMessages = [];
        await assert.rejects(loadRequiredRPackages(["missing", "declared"], {
            readStatus: async () => "missing|",
            attach: async () => { throw new Error("Must not attach when a package is missing."); },
            missingPackages: (message) => { missingMessages.push(message); }
        }), /Required package\(s\) not installed: missing/);
        assert.equal(missingMessages.length, 1);
        await assert.rejects(loadRequiredRPackages(["declared"], {
            readStatus: async () => { throw new Error("query unavailable"); },
            attach: async () => { throw new Error("Must not attach after a failed query."); }
        }), /query unavailable/);
        assert.deepEqual(await loadRequiredRPackages([], {
            readStatus: async () => { throw new Error("Empty packages must not query R."); },
            attach: async () => { throw new Error("Empty packages must not attach."); }
        }), []);

        for (const invalidStatus of [
            "", null, undefined, false, [], {}, "TRUE", "||", "declared",
            "|foreign", "|declared,declared", "|declared,", "declared,,|",
            "|declared extra", "warnings\n|declared"
        ]) {
            let attachmentCount = 0;
            let readyCount = 0;
            await assert.rejects(loadRequiredRPackages(["declared"], {
                readStatus: async () => invalidStatus,
                attach: async () => { attachmentCount += 1; },
                packageReady: () => { readyCount += 1; }
            }), /Invalid R package status response/);
            assert.equal(attachmentCount, 0, host);
            assert.equal(readyCount, 0, "Malformed status must not populate readiness state.");
        }

        assert.deepEqual(await loadRequiredRPackages(["declared"], {
            readStatus: async () => "\n|declared\n",
            attach: async () => { throw new Error("Already attached package must be skipped."); },
            packagesLoaded: async () => { throw new Error("Already attached packages must not refresh."); }
        }), []);
    }
    console.log("Shared package attachment cases passed; actual package workflows remain separate acceptance.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});

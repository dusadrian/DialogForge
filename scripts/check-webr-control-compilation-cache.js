"use strict";

const assert = require("node:assert/strict");
const { installWebRSharedRuntimeControl } = require("../dist/src/runtime/providers/webr/webRSharedRuntimeControl");

const checkRequiredHelperCleanup = async function(helper, mode) {
    const archivePath = `/helper-fixture/${helper}.tgz`;
    const stagingFailure = new Error("required helper staging failed");
    const cleanupFailure = new Error("required helper cleanup failed");
    const calls = [];
    const released = [];
    const writeFails = mode === "write-failed" || mode === "write-and-cleanup-failed";
    const extractionFails = mode === "extraction-failed" || mode === "extraction-and-cleanup-failed";
    const cleanupFails = mode === "cleanup-failed"
        || mode === "write-and-cleanup-failed"
        || mode === "extraction-and-cleanup-failed";
    const runtime = {
        evalRString: async function(command) {
            if (command.includes('runtime_control_source_names("dispatch")')) {
                return "core:runtimePrelude.R\ndispatch:runtimeDispatchCore.R";
            }
            return command === "as.character(getRversion())" ? "4.6.0" : "/helper-fixture";
        },
        evalRVoid: async function(command) {
            calls.push(command);
            if (extractionFails && command.includes(`utils::untar(${JSON.stringify(archivePath)}`)) {
                throw stagingFailure;
            }
        },
        FS: {
            writeFile: async function(path) {
                if (writeFails && path === archivePath) {
                    throw stagingFailure;
                }
            },
            unlink: async function(path) {
                released.push(path);
                if (cleanupFails && path === archivePath) {
                    throw cleanupFailure;
                }
            }
        }
    };
    const startup = installWebRSharedRuntimeControl({
        runtime,
        runRuntimeOperation: action => action(),
        fetchSource: async () => "",
        fetchInspectionArchive: async () => new Uint8Array(),
        fetchTransportArchive: async () => new Uint8Array()
    });
    if (mode === "ready") {
        const client = await startup;
        client.detach();
        assert.ok(calls.at(-1).includes("runtime_prepare_control_functions"));
    }
    else {
        await assert.rejects(startup, function(error) {
            assert.equal(error, writeFails || extractionFails ? stagingFailure : cleanupFailure,
                "Archive cleanup cannot replace the primary required-helper failure.");
            return true;
        });
        assert.equal(calls.some(command => command.includes("runtime_prepare_control_functions")), false,
            "Failed required-helper staging or cleanup cannot publish a ready client.");
    }
    assert.equal(released.filter(path => path === archivePath).length, 1,
        "The captured archive receives one cleanup attempt, including a failed write.");
    if (writeFails) {
        assert.equal(calls.some(command => command.includes(`utils::untar(${JSON.stringify(archivePath)}`)), false,
            "A failed archive write must not proceed to extraction.");
    }
};

const checkCacheStaging = async function(mode) {
    const calls = [];
    const released = [];
    const runtime = {
        evalRString: async command => command.includes('runtime_control_source_names("dispatch")')
            ? "core:runtimePrelude.R\ndispatch:runtimeDispatchCore.R"
            : command === "as.character(getRversion())" ? "4.6.0" : "/cache-fixture",
        evalRVoid: async command => { calls.push(command); },
        FS: {
            writeFile: async path => {
                if (mode === "write-failed" && path === "/cache-fixture") {
                    throw Error("physical staging failed");
                }
            },
            unlink: async path => {
                released.push(path);
                if (mode === "unlink-failed" && path === "/cache-fixture") {
                    throw Error("physical release failed");
                }
            }
        }
    };
    await installWebRSharedRuntimeControl({
        runtime,
        runRuntimeOperation: action => action(),
        fetchSource: async () => "",
        fetchInspectionArchive: async () => new Uint8Array(),
        fetchTransportArchive: async () => new Uint8Array(),
        fetchControlCompilationCache: async () => {
            if (mode === "fetch-failed") throw Error("physical fetch failed");
            return mode === "missing" ? null : new Uint8Array([1, 2, 3]);
        }
    });
    const load = calls.find(command => command.includes("runtime_read_control_compilation_cache"));
    if (mode === "missing" || mode === "fetch-failed") {
        assert.equal(load, undefined);
    }
    else {
        assert.ok(load.includes(mode === "write-failed" ? '("")' : '("/cache-fixture")'));
        assert.ok(released.includes("/cache-fixture"));
    }
    assert.ok(calls.at(-1).includes("runtime_prepare_control_functions"),
        "Optional cache failures must not skip common preparation");
};

(async function() {
    for (const helper of ["dialogforgeinspect_0.4.3", "dialogforgetransport_0.0.4"]) {
        for (const mode of [
            "ready", "write-failed", "extraction-failed", "cleanup-failed",
            "write-and-cleanup-failed", "extraction-and-cleanup-failed"
        ]) {
            await checkRequiredHelperCleanup(helper, mode);
        }
    }
    for (const mode of ["ready", "missing", "fetch-failed", "write-failed", "unlink-failed"]) {
        await checkCacheStaging(mode);
    }
    console.log("Required helper cleanup and optional worker cache cases passed; real startup/bytecode/latency acceptance remains separate.");
})().catch(error => { console.error(error); process.exitCode = 1; });

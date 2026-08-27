"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const ts = require(path.join(rootDir, "node_modules/typescript"));

require.extensions[".ts"] = function(module, fileName) {
    const output = ts.transpileModule(
        fs.readFileSync(fileName, "utf8"),
        {
            compilerOptions: {
                target: ts.ScriptTarget.ES2022,
                module: ts.ModuleKind.CommonJS,
                esModuleInterop: true
            },
            fileName
        }
    );

    module._compile(output.outputText, fileName);
};

const compatibility = require(path.join(
    rootDir,
    "src/runtime/providers/r/dependencies/rPackageCompatibility.ts"
));
const runtimeRequirements = require(path.join(
    rootDir,
    "src/runtime/providers/r/dependencies/runtimePackageRequirements.ts"
));
const webRAdapterModule = require(path.join(
    rootDir,
    "src/runtime/providers/webr/webRRuntimePackageAdapter.ts"
));
const nativeCompositionModule = require(path.join(
    rootDir,
    "src/shell-electron/dialog-runtime/productDialogRuntimeComposition.ts"
));
const { dialogRuntimeIpcChannels } = require(path.join(
    rootDir,
    "src/dialog-runtime/dialogRuntimeIpc.ts"
));


const verifyResolver = function() {
    assert.strictEqual(
        compatibility.compareRVersions("1.10.0", "1.9.9"),
        1
    );
    assert.strictEqual(
        compatibility.compareRVersions("1.0-10", "1.0-2"),
        1
    );
    assert.strictEqual(
        compatibility.compareRVersions("1.0", "1.0.0"),
        0
    );
    assert.strictEqual(
        compatibility.compareRVersions("1.0.0", "1"),
        0
    );
    assert.strictEqual(
        compatibility.compareRVersions("1.0.1", "1.0"),
        1
    );
    assert.throws(() => {
        compatibility.normalizeRPackageRequirements(["statistics"]);
    }, /structured objects/);
    assert.deepStrictEqual(
        compatibility.normalizeRPackageRequirementsAtIngestion([
            "statistics",
            { name: "statistics", minimumVersion: "0.14" },
            {
                name: "statistics",
                minimumVersion: "0.14",
                minimumVersionExclusive: true
            },
            { name: "admisc" }
        ]),
        [
            {
                name: "statistics",
                minimumVersion: "0.14",
                minimumVersionExclusive: true
            },
            { name: "admisc" }
        ]
    );
    assert.throws(() => {
        compatibility.normalizeRPackageRequirements([{
            name: "QCA",
            minimumVersionExclusive: true
        }]);
    }, /requires minimumVersion/);
    assert.throws(() => {
        compatibility.readInstalledRPackageManifest({
            schemaVersion: 1,
            packages: {
                statistics: "0.14"
            }
        });
    }, /has no version/);

    const result = compatibility.resolveRPackageCompatibility([
        { name: "statistics", minimumVersion: "0.14" },
        { name: "admisc", minimumVersion: "0.40" },
        { name: "declared" }
    ], {
        schemaVersion: 1,
        packages: {
            statistics: { version: "0.13" },
            admisc: { version: "0.41" }
        }
    });

    assert.deepStrictEqual(
        result.packages.map((entry) => entry.status),
        ["too-old", "satisfied", "missing"]
    );

    const strictResult = compatibility.resolveRPackageCompatibility([
        {
            name: "statistics",
            minimumVersion: "0.14",
            minimumVersionExclusive: true
        },
        {
            name: "QCA",
            minimumVersion: "3.25",
            minimumVersionExclusive: true
        }
    ], {
        schemaVersion: 1,
        packages: {
            statistics: { version: "0.14" },
            QCA: { version: "3.25.1" }
        }
    });

    assert.deepStrictEqual(
        strictResult.packages.map((entry) => entry.status),
        ["too-old", "satisfied"]
    );
    assert.match(
        compatibility.createRPackageCompatibilityMessage(strictResult),
        /statistics: requires a version newer than 0\.14; installed 0\.14\./
    );

    assert.deepStrictEqual(
        runtimeRequirements.readRDialogPackageRequirements({
            definition: {
                id: "example",
                rPackages: ["statistics"],
                dependencies: "declared"
            },
            source: {
                properties: {
                    rPackageRequirements: [{
                        name: "statistics",
                        minimumVersion: "0.13"
                    }],
                    dependencies: "admisc"
                }
            },
            runtimeRequirements: {
                rPackages: [{
                    name: "statistics",
                    minimumVersion: "0.14"
                }]
            }
        }, {
            example: ["QCA"]
        }),
        [
            { name: "statistics", minimumVersion: "0.14" },
            { name: "QCA" },
            { name: "admisc" },
            { name: "declared" }
        ]
    );
};


const createWebRAdapter = function(version) {
    const visibleCommands = [];
    const adapter = webRAdapterModule.createWebRRuntimePackageAdapter({
        loadedPackages: new Set(),
        createActivity: function() {
            return { id: "activity" };
        },
        finishActivity: function() {},
        recordRuntimeMessageStream: function() {},
        setRuntimeBusy: function() {},
        renderToolbar: function() {},
        ensureRuntime: async function() {},
        evaluateHiddenText: async function(command) {
            return command.includes("packageVersion")
                ? `statistics\t${version}`
                : "|";
        },
        executeVisibleCommand: async function(command) {
            visibleCommands.push(command);
            return { ok: true };
        }
    });

    return { adapter, visibleCommands };
};


const verifyWebRProtection = async function() {
    const payload = {
        runtimeRequirements: {
            rPackages: [{
                name: "statistics",
                minimumVersion: "0.14"
            }]
        }
    };
    const outdated = createWebRAdapter("0.13");

    await assert.rejects(
        outdated.adapter.ensureDialogPackages(payload),
        /requires 0\.14 or newer; installed 0\.13/
    );
    assert.deepStrictEqual(outdated.visibleCommands, []);

    const current = createWebRAdapter("0.14");

    await current.adapter.ensureDialogPackages(payload);
    assert.deepStrictEqual(current.visibleCommands, ["library(statistics)"]);
};


const verifyNativeProtection = async function() {
    const handlers = new Map();
    const visibleCommands = [];
    let installedVersion = "0.13";
    const ipcMain = {
        on: function() {},
        handle: function(channel, handler) {
            handlers.set(channel, handler);
        }
    };

    nativeCompositionModule.registerProductDialogRuntimeComposition({
        ipcMain,
        productId: "DialogR",
        runtimeSessionManager: {
            executeInvisibleQuery: async function(request) {
                return request.query.includes("packageVersion")
                    ? {
                        status: "ready",
                        value: `statistics\t${installedVersion}`,
                        message: ""
                    }
                    : {
                        status: "ready",
                        value: true,
                        message: ""
                    };
            },
            executeVisibleCommand: async function(request) {
                visibleCommands.push(request.text);
                return [];
            },
            executeDialog: async function() {
                return { status: "ready" };
            },
            executeRuntimeMethod: async function() {
                return { status: "ready" };
            }
        },
        openImportFile: async function() {},
        previewImportFile: async function() {},
        getUiCommandVisibility: function() {
            return "hidden";
        },
        executeVisibleCommandAndBroadcast: async function() {
            return [];
        },
        sendTranscriptEvents: function() {},
        invalidateDatasetPreview: function() {},
        refreshWorkspaceAndBroadcast: async function() {},
        broadcastRuntimeEvents: async function() {},
        reportError: function() {}
    });

    const runDialog = handlers.get(
        dialogRuntimeIpcChannels.runVisibleCommand
    );
    const result = await runDialog({}, {
        command: "anovahv(...)",
        dialogID: "anovahv",
        dependencies: ["statistics"],
        rPackageRequirements: [{
            name: "statistics",
            minimumVersion: "0.14"
        }]
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, "r-package-update-required");
    assert.match(result.error, /installed 0\.13/);
    assert.deepStrictEqual(visibleCommands, []);

    installedVersion = "0.14";
    const satisfied = await runDialog({}, {
        command: "anovahv(...)",
        dialogID: "anovahv",
        dependencies: ["statistics"],
        rPackageRequirements: [{
            name: "statistics",
            minimumVersion: "0.14"
        }]
    });

    assert.strictEqual(satisfied.ok, true);
    assert.deepStrictEqual(visibleCommands, ["anovahv(...)"]);
};


const main = async function() {
    verifyResolver();
    await verifyWebRProtection();
    await verifyNativeProtection();
    console.log("DialogForge R package compatibility tests passed.");
};


main().catch((error) => {
    console.error(error);
    process.exit(1);
});

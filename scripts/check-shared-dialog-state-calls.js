"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createDialogBindingState } = require("../dist/src/dialog-runtime/custom-js/dialogBindings");
const { createDialogExternalCallHost } = require("../dist/src/dialog-runtime/custom-js/externalCallHost");
const { routeDialogStateCall, createDialogFilterStateDelivery } = require("../dist/src/dialog-runtime/custom-js/dialogStateCallRouter");
const { createDialogChannelAdapter } = require("../dist/src/dialog-runtime/dialogChannelAdapter");
const { createDialogExternalCallIpcController } = require("../dist/src/shell-electron/dialog-runtime/externalCallIpcController");
const {
    dialogRuntimeEventChannels,
    dialogRuntimeIpcChannels
} = require("../dist/src/dialog-runtime/dialogRuntimeIpc");
const { EventEmitter } = require("node:events");
const {
    createProductDialogRuntimeIpcController
} = require("../dist/src/shell-electron/dialog-runtime/productDialogRuntimeIpcController");
const customJSRuntime = require("../dist/src/dialog-runtime/renderer/library/customJSRuntime").default;
const {
    createBrowserImportAdapter
} = require("../dist/src/shell-web/browserImportAdapter");
const {
    previewImportFileWithRuntime
} = require("../dist/src/runtime/tabular-data/importPreview");
const {
    previewImportFileThroughRuntime
} = require("../dist/src/runtime/tabular-data/runtimeImportPreview");
const {
    RuntimeDependencyPreparationError
} = require("../dist/src/runtime/dependencies/runtimeDependencyPreparation");
const {
    createRDialogCommandPackageRequirements
} = require("../dist/src/runtime/providers/r/dependencies/runtimePackageRequirements");

const checkDialogCommandReceipts = async function() {
    const handlers = new Map();
    const listeners = new Map();
    const calls = [];
    const reports = [];
    const payload = {
        command: "  value <- 1  ", dialogID: "import",
        dependencies: "declared; declared\nutils",
        rPackageRequirements: [{ name: "declared", minimumVersion: "0.25" }]
    };
    let dependencyResult = { ok: true, error: "" };
    let dependencyError;
    let commandError;
    let events = [];
    let browserReceipt;

    createProductDialogRuntimeIpcController({
        ipcMain: {
            on: (channel, callback) => listeners.set(channel, callback),
            handle: (channel, callback) => handlers.set(channel, callback)
        },
        runtimeSessionManager: {},
        getProductId: () => { calls.push(["product"]); return "base"; },
        ensureDependencies: async function(dependencies, requirements, source) {
            assert.equal(source, dependencies ? "base.dialog.import" : "base.dialog.unknown");
            calls.push(["dependencies", dependencies, requirements]);
            if (dependencyError) {
                throw dependencyError;
            }
            return dependencyResult;
        },
        executeVisibleCommand: async function(request) {
            assert.equal(request.kind, "commands.visible");
            assert.ok(Number.isFinite(Date.parse(request.createdAt)));
            calls.push(["command", request.text, request.source]);
            if (commandError) {
                throw commandError;
            }
            return events;
        },
        broadcastRuntimeEvents: async () => {},
        reportError: (error) => reports.push(error)
    });
    const browser = createDialogChannelAdapter({
        getProductId: () => { calls.push(["product"]); return "base"; },
        ensureRuntimePackages: async function(input) {
            calls.push(["dependencies", input.dependencies, input.rPackageRequirements]);
            if (dependencyError) {
                throw dependencyError;
            }
            if (!dependencyResult.ok) {
                throw new RuntimeDependencyPreparationError(dependencyResult);
            }
        },
        executeVisibleCommand: async function(command, options) {
            calls.push(["command", command, options.source]);
            if (commandError) {
                throw commandError;
            }
            return browserReceipt;
        },
        runActivity: async function(message, action) {
            assert.equal(message, "Running dialog command...");
            calls.push(["activity-start"]);
            try {
                return await action();
            }
            finally {
                calls.push(["activity-end"]);
            }
        }
    });
    const invokeNative = (input) => {
        return handlers.get(dialogRuntimeIpcChannels.runVisibleCommand)({}, input);
    };
    const invokeBrowser = (input) => browser.executeDialog(input);
    const commandCalls = () => calls.filter((entry) => !entry[0].startsWith("activity-"));

    for (const input of [undefined, null, {}, { command: " \n " }]) {
        calls.length = 0;
        assert.deepEqual(await invokeBrowser(input), await invokeNative(input));
        assert.deepEqual(calls, [], "Empty commands must not prepare packages or start activity.");
    }

    assert.deepEqual(createRDialogCommandPackageRequirements(
        payload.dependencies, payload.rPackageRequirements
    ), [{ name: "declared", minimumVersion: "0.25" }, { name: "utils" }]);

    for (const { transcript, ok, printed, error } of [
        { transcript: [], ok: true, printed: "", error: "" },
        { transcript: [{ type: "output", message: "Printed." }],
            ok: true, printed: "Printed.", error: "" },
        { transcript: [{ type: "output", message: "First." }, { type: "output", message: "Second." }],
            ok: true, printed: "First.\nSecond.", error: "" },
        ...["error", "rejected", "failed"].map((type) => ({
            transcript: [{ type, message: "Failed." }], ok: false, printed: "", error: "Failed."
        })),
        { transcript: [{ type: "completed", state: "error", message: "Failed." }],
            ok: false, printed: "", error: "Failed." }
    ]) {
        events = transcript;
        browserReceipt = { ok: true, transcriptEvents: transcript };
        calls.length = 0;
        const nativeResult = await invokeNative(payload);
        const nativeCalls = commandCalls();
        calls.length = 0;
        const browserResult = await invokeBrowser(payload);
        assert.deepEqual(browserResult, nativeResult, JSON.stringify(transcript));
        assert.equal(browserResult.ok, ok);
        assert.equal(browserResult.printed, printed);
        assert.equal(browserResult.error, error);
        assert.equal(browserResult.events, transcript, "Do not discard accepted runtime events.");
        assert.deepEqual(commandCalls(), nativeCalls);
        assert.deepEqual(nativeCalls, [
            ["product"],
            ["dependencies", payload.dependencies, payload.rPackageRequirements],
            ["command", "value <- 1", "base.dialog.import"]
        ]);
        assert.deepEqual(calls.filter((entry) => entry[0].startsWith("activity-")), [
            ["activity-start"], ["activity-end"]
        ]);
    }

    events = [];
    browserReceipt = { ok: true, transcriptEvents: events };
    calls.length = 0;
    assert.deepEqual(await invokeBrowser({ text: "  value <- 2  " }),
        await invokeNative({ text: "  value <- 2  " }));
    assert.deepEqual(calls.filter((entry) => entry[0] === "command"), [
        ["command", "value <- 2", "base.dialog.unknown"],
        ["command", "value <- 2", "base.dialog.unknown"]
    ]);

    for (const receipt of [null, undefined, {}, { ok: false },
        { ok: false, transcriptEvents: [{ type: "output", message: "Partial output." }] }]) {
        browserReceipt = receipt;
        const result = await invokeBrowser(payload);
        assert.equal(result.ok, false, "Missing/negative receipts must not close a dialog as success.");
        assert.equal(result.status, "error");
        assert.ok(result.error);
    }

    for (const status of ["error", "r-package-update-required"]) {
        dependencyResult = { ok: false, status, error: "Preparation failed." };
        calls.length = 0;
        const nativeResult = await invokeNative(payload);
        const browserResult = await invokeBrowser(payload);
        assert.deepEqual(browserResult, nativeResult);
        assert.equal(browserResult.status, status);
        assert.equal(browserResult.error, dependencyResult.error);
        assert.equal(calls.some((entry) => entry[0] === "command"), false);
    }
    dependencyResult = { ok: true, error: "" };
    const failure = new Error("Unrelated host failure.");
    for (const stage of ["dependencies", "command"]) {
        dependencyError = stage === "dependencies" ? failure : null;
        commandError = stage === "command" ? failure : null;
        calls.length = 0;
        await assert.rejects(invokeNative(payload), (error) => error === failure);
        await assert.rejects(invokeBrowser(payload), (error) => error === failure);
        assert.equal(calls.at(-1)[0], "activity-end", "Thrown failures still release browser activity.");
    }
    dependencyError = null;
    commandError = null;

    const settle = () => new Promise((resolve) => setImmediate(resolve));
    const send = listeners.get(dialogRuntimeEventChannels.runCommand);
    calls.length = 0;
    send({}, { command: " " });
    await settle();
    assert.deepEqual(calls, []);
    send({}, payload);
    await settle();
    assert.equal(calls.filter((entry) => entry[0] === "command").length, 1);
    dependencyResult = { ok: false, error: "Preparation failed." };
    calls.length = 0;
    send({}, payload);
    await settle();
    assert.deepEqual(reports, [dependencyResult.error]);
    assert.equal(calls.some((entry) => entry[0] === "command"), false);
    dependencyResult = { ok: true, error: "" };
    commandError = failure;
    send({}, payload);
    await settle();
    assert.equal(reports.at(-1), failure);
};

const checkDialogCommandActivation = async function() {
    const previousModules = globalThis.dialogForgeProfileCustomJSModules;
    let api;

    try {
        globalThis.dialogForgeProfileCustomJSModules = [{
            extendCustomJSApi: (value) => { api = value; }
        }];

        for (const host of ["native", "browser"]) {
            const outcomes = ["accepted", "failed", "package-update"];

            for (const outcome of outcomes) {
                for (const owner of ["current", "same-id-rebuild", "different-id"]) {
                    let finish;
                    let started;
                    let receipt;
                    let invocations = 0;
                    const began = new Promise((resolve) => { started = resolve; });
                    const result = new Promise((resolve) => { finish = resolve; });
                    const sent = [];
                    const objects = {
                        dialogID: "import", objList: {}, radios: {}, dataframes: {},
                        events: new EventEmitter()
                    };
                    let invoke;

                    if (host === "native") {
                        const handlers = new Map();
                        createProductDialogRuntimeIpcController({
                            ipcMain: {
                                on() {},
                                handle: (channel, callback) => handlers.set(channel, callback)
                            },
                            runtimeSessionManager: {},
                            getProductId: () => "base",
                            ensureDependencies: async () => {
                                if (outcome === "package-update") {
                                    started();
                                    return result;
                                }
                                return { ok: true, error: "" };
                            },
                            executeVisibleCommand: async () => { started(); return result; },
                            broadcastRuntimeEvents: async () => {},
                            reportError(error) { throw error; }
                        });
                        invoke = async (channel, input) => {
                            invocations += 1;
                            receipt = await handlers.get(channel)({}, input);
                            return receipt;
                        };
                    }
                    else {
                        const adapter = createDialogChannelAdapter({
                            ensureRuntimePackages: async function() {
                                if (outcome === "package-update") {
                                    started();
                                    throw new RuntimeDependencyPreparationError(await result);
                                }
                            },
                            executeVisibleCommand: async () => { started(); return result; }
                        });
                        invoke = async (channel, input) => {
                            assert.equal(channel, dialogRuntimeIpcChannels.runVisibleCommand);
                            invocations += 1;
                            receipt = await adapter.executeDialog(input);
                            return receipt;
                        };
                    }

                    await customJSRuntime.setup({ customJS: ";" }, objects, {
                        invoke, on() {}, sendTo: (...args) => sent.push(args)
                    });
                    const pending = api.run("value <- 1", { dependencies: [] });
                    await began;

                    if (owner === "same-id-rebuild") {
                        customJSRuntime.reset(objects);
                        objects.objList = {};
                    }
                    else if (owner === "different-id") {
                        objects.dialogID = "replacement";
                    }

                    finish(outcome === "package-update"
                        ? { ok: false, status: "r-package-update-required", error: "Package update needed." }
                        : host === "native"
                            ? [{
                                type: outcome === "accepted" ? "output" : "error",
                                message: outcome === "accepted" ? "Completed." : "Command failed."
                            }]
                            : { ok: outcome === "accepted" });
                    const returned = await pending;
                    assert.equal(returned, receipt, "Retirement must preserve the exact command receipt.");
                    const effects = sent.filter((entry) => {
                        return entry[1] === dialogRuntimeEventChannels.closeWindow
                            || entry[1] === dialogRuntimeEventChannels.showMessage;
                    });
                    const expected = owner === "current" && outcome !== "failed" ? 1 : 0;
                    assert.equal(effects.length, expected, host + "/" + outcome + "/" + owner);

                    if (expected && outcome === "accepted") {
                        assert.deepEqual(effects[0], [
                            "main", dialogRuntimeEventChannels.closeWindow, { dialogID: "import" }
                        ]);
                    }
                    if (expected && outcome === "package-update") {
                        assert.equal(effects[0][1], dialogRuntimeEventChannels.showMessage);
                        assert.equal(effects[0][4], "Package update needed.");
                    }
                    if (owner !== "current") {
                        const previousInvocations = invocations;
                        const previousEffects = sent.length;
                        const rejected = await api.run("  value <- 2  ", { dependencies: [] });
                        assert.equal(rejected.ok, false);
                        assert.equal(rejected.status, "rejected");
                        assert.equal(rejected.command, "value <- 2");
                        assert.match(rejected.error, /controls were replaced/);
                        assert.equal(invocations, previousInvocations,
                            "An older API must not admit a command into replacement controls.");
                        assert.equal(sent.length, previousEffects,
                            "Rejected admission must not publish syntax, close or warning effects.");
                    }
                }
            }
        }
    }
    finally {
        if (previousModules === undefined) {
            delete globalThis.dialogForgeProfileCustomJSModules;
        }
        else {
            globalThis.dialogForgeProfileCustomJSModules = previousModules;
        }
    }
};

const checkExternalCallActivation = async function() {
    const previousModules = globalThis.dialogForgeProfileCustomJSModules;
    let api;

    try {
        globalThis.dialogForgeProfileCustomJSModules = [{
            extendCustomJSApi: (value) => { api = value; }
        }];
        for (const host of ["native", "browser"]) {
            for (const owner of ["current", "same-id-rebuild", "different-id"]) {
                for (const reply of ["controls", "syntax", "failed"]) {
                    let finish;
                    let started;
                    const began = new Promise((resolve) => { started = resolve; });
                    const response = new Promise((resolve) => { finish = resolve; });
                    const updates = [];
                    const sent = [];
                    let hostCalls = 0;
                    const makeControls = () => ({ input1: {
                        name: "input1", value: "", setValue: (value) => updates.push(value)
                    } });
                    const objects = {
                        dialogID: "fixture", objList: makeControls(), radios: {}, dataframes: {},
                        command: "", events: new EventEmitter()
                    };
                    const callHost = async () => { hostCalls += 1; started(); return response; };
                    let invoke;
                    if (host === "native") {
                        const handlers = new Map();
                        createDialogExternalCallIpcController({
                            ipcMain: { handle: (channel, callback) => handlers.set(channel, callback) },
                            host: { call: callHost },
                            shouldPublishConsoleStateChips: () => false,
                            readConsoleStateChips: async () => [],
                            refreshConsoleStateChips: async () => {}
                        });
                        invoke = (channel, ...args) => handlers.get(channel)({}, ...args);
                    }
                    else {
                        const adapter = createDialogChannelAdapter({ callExternal: callHost });
                        invoke = (channel, ...args) => {
                            assert.equal(channel, dialogRuntimeIpcChannels.callExternal);
                            return adapter.callExternal({}, args);
                        };
                    }
                    await customJSRuntime.setup({ customJS: ";" }, objects, {
                        invoke, on() {}, sendTo: (...args) => sent.push(args)
                    });
                    const oldApi = api;
                    const callName = reply === "syntax" ? "refreshSummarySyntax" : "hostControlReply";
                    const pending = oldApi.callExternal(callName, {});
                    const observed = pending.then(
                        (value) => ({ value }), (error) => ({ error })
                    );
                    await began;
                    if (owner === "same-id-rebuild") {
                        customJSRuntime.reset(objects);
                        objects.objList = makeControls();
                    }
                    else if (owner === "different-id") {
                        objects.dialogID = "replacement";
                    }
                    const value = reply === "syntax" ? "host syntax" : {
                        controlValues: { input1: "host value" }
                    };
                    finish({ status: reply === "failed" ? "failed" : "ready",
                        value, message: "Host call failed." });
                    const returned = await observed;
                    if (reply === "failed") {
                        assert.equal(returned.error.message, "Host call failed.");
                    }
                    else {
                        assert.equal(returned.value, value,
                            "An accepted external reply must retain its exact value after rebuild.");
                    }
                    assert.deepEqual(updates, owner === "current" && reply === "controls"
                        ? ["host value"] : [], host + "/" + owner + "/" + reply);
                    assert.equal(objects.command, owner === "current" && reply === "syntax"
                        ? "host syntax" : "");
                    assert.equal(sent.length, owner === "current" && reply === "syntax" ? 1 : 0);
                    if (owner !== "current") {
                        let localCalls = 0;
                        oldApi.registerExternalCall("localProbe", () => { localCalls += 1; });
                        const before = hostCalls;
                        await assert.rejects(oldApi.callExternal("hostControlReply", {}),
                            /controls were replaced/);
                        await assert.rejects(oldApi.callExternal("localProbe", {}),
                            /controls were replaced/);
                        assert.equal(hostCalls, before, "Retired API must not dispatch a host call.");
                        assert.equal(localCalls, 0, "Retired API must not invoke a local extension.");
                    }
                }
            }
        }

        let finishExtension;
        let startedExtension;
        const beganExtension = new Promise((resolve) => { startedExtension = resolve; });
        const extension = new Promise((resolve) => { finishExtension = resolve; });
        globalThis.dialogForgeProfileCustomJSModules = [{
            extendCustomJSApi: async () => { startedExtension(); await extension; }
        }];
        const sent = [];
        const objects = {
            dialogID: "fixture", objList: {}, radios: {}, dataframes: {},
            events: new EventEmitter()
        };
        const setup = customJSRuntime.setup({ customJS: 'updateSyntax("old setup");' }, objects, {
            on() {}, sendTo: (...args) => sent.push(args)
        });
        await beganExtension;
        objects.objList = {};
        finishExtension();
        await setup;
        assert.deepEqual(sent, [], "Late profile preparation must not run an old dialog script.");
    }
    finally {
        if (previousModules === undefined) {
            delete globalThis.dialogForgeProfileCustomJSModules;
        }
        else {
            globalThis.dialogForgeProfileCustomJSModules = previousModules;
        }
    }
};

const checkImportPreviewActivation = async function() {
    const code = fs.readFileSync(path.join(
        __dirname, "../src/base-app/dialogs/source/import/actions.js"
    ), "utf8");
    const controlNames = [
        "input1", "input2", "input3", "select1", "select2", "select3", "select4",
        "checkbox1", "checkbox2", "checkbox3", "radio1", "radio2", "radio3",
        "radio4", "radio5", "radio6", "radio7", "radio8", "browse", "b_import",
        "separator_group", "type_group", "decimal_group"
    ];
    const changes = new Map();
    const clicks = new Map();
    const values = new Map();
    const checked = new Set();
    const previews = [];
    const syntax = [];
    const imports = [];
    const canvas = {
        children: [],
        contains: (node) => node === input && input.isConnected,
        appendChild(node) { this.children.push(node); }
    };
    const input = { isConnected: true, closest: () => canvas };
    const document = {
        // This fixture checks ownership only; real DOM/CSS acceptance is separate.
        createElement: () => ({
            children: [], style: {}, isConnected: true, textContent: "",
            set innerHTML(_value) { this.children = []; },
            appendChild(node) { this.children.push(node); }
        }),
        body: {
            appendChild() { throw new Error("Preview must belong to the shared canvas."); }
        }
    };
    let workingDirectory = Promise.resolve({ path: "/runtime", home: "/home" });
    let selectedFile = Promise.resolve({ ok: false, cancelled: true });
    const api = {
        getElementNode: () => input,
        getValue: (name) => values.get(name),
        setValue: (name, value) => values.set(name, value),
        check: (name) => checked.add(name),
        isChecked: (name) => checked.has(name),
        enable() {}, disable() {}, clearError() {}, addError() {},
        getWorkingDirectory: () => workingDirectory,
        updateSyntax: (command) => syntax.push(command),
        getImportPreview: (request) => new Promise((resolve) => {
            previews.push({ request, resolve });
        }),
        openImportFile: () => selectedFile,
        run: async (command) => { imports.push(command); },
        onChange: (name, callback) => changes.set(name, callback),
        onClick: (name, callback) => clicks.set(name, callback)
    };
    const bindings = controlNames.map((name) => `const ${name} = ${JSON.stringify(name)};`);
    new Function("api", "document", [
        ...bindings, `const { ${Object.keys(api).join(", ")} } = api;`, code
    ].join("\n"))(api, document);
    const settle = () => new Promise((resolve) => setImmediate(resolve));
    await settle();
    assert.equal(canvas.children.length, 1, "Initial preview belongs to its controls' canvas.");

    values.set("input1", "/runtime/older.csv");
    changes.get("input1")();
    await settle();
    values.set("input1", "/runtime/newer.csv");
    changes.get("input1")();
    await settle();
    assert.equal(previews.length, 2);
    assert.equal(previews[0].request.file, "/runtime/older.csv");
    assert.equal(previews[1].request.file, "/runtime/newer.csv");
    previews[1].resolve({ error: "Newer preview" });
    await settle();
    previews[0].resolve({ error: "Older preview" });
    await settle();
    assert.equal(canvas.children[0].children[0].textContent, "Newer preview",
        "A late older reply must not replace the latest preview.");

    changes.get("input1")();
    await settle();
    input.isConnected = false;
    canvas.children = [];
    previews[2].resolve({ error: "Retired preview" });
    await settle();
    assert.equal(canvas.children.length, 0, "A rebuilt activation must not recreate its old preview.");

    input.isConnected = true;
    let finishDirectory;
    workingDirectory = new Promise((resolve) => { finishDirectory = resolve; });
    changes.get("input1")();
    const pendingImport = clicks.get("b_import")();
    const syntaxBeforeRetirement = syntax.length;
    input.isConnected = false;
    finishDirectory({ path: "/runtime", home: "/home" });
    await pendingImport;
    await settle();
    assert.equal(previews.length, 3, "Retired directory work must not dispatch a preview.");
    assert.equal(syntax.length, syntaxBeforeRetirement);
    assert.deepEqual(imports, [], "Retired directory work must not dispatch an import.");

    input.isConnected = true;
    let finishSelection;
    selectedFile = new Promise((resolve) => { finishSelection = resolve; });
    const pendingSelection = clicks.get("browse")();
    input.isConnected = false;
    finishSelection({ ok: true, filePath: "/runtime/retired.csv" });
    await pendingSelection;
    assert.equal(values.get("input1"), "/runtime/newer.csv",
        "A retired picker reply must not change a replacement file field.");
    assert.equal(canvas.children.length, 0);
};

const checkImportPreviewFallbackBoundary = async function() {
    const request = { file: "/runtime/file.csv", command: "read.csv" };
    const fallback = { status: "ready", error: "", colnames: ["v"], vdata: [["1"]] };
    let result;
    let fallbackCalls = 0;
    const execute = async () => result;
    const readFallback = function(normalized) {
        assert.equal(normalized.file, request.file);
        fallbackCalls += 1;
        return fallback;
    };

    for (const status of ["unavailable", "unsupported"]) {
        result = { status, message: "Runtime preview is unavailable." };
        assert.equal(await previewImportFileThroughRuntime(request, execute, readFallback), fallback);

        const before = fallbackCalls;
        for (const options of [
            { runtimeOnly: true }, { binary: true }, { command: "convert" }
        ]) {
            const preview = await previewImportFileThroughRuntime(
                { ...request, ...options }, execute, readFallback
            );
            assert.equal(preview.status, status);
            assert.equal(preview.error, result.message);
        }
        assert.equal(fallbackCalls, before, "Runtime-only/binary requests cannot use text fallback.");
        assert.equal((await previewImportFileThroughRuntime(request, execute)).status, status);
    }

    const before = fallbackCalls;
    result = { status: "failed", message: "Runtime read failed." };
    assert.equal((await previewImportFileThroughRuntime(request, execute, readFallback)).error,
        result.message);
    result = { status: "ready", value: { status: "unsupported", error: "Reader rejected the file." } };
    assert.equal((await previewImportFileThroughRuntime(request, execute, readFallback)).error,
        result.value.error);
    assert.equal(fallbackCalls, before, "Accepted runtime results/errors must not be reparsed.");
};

const checkRuntimeImportPreviewPaths = async function() {
    for (const host of ["native", "browser"]) {
        const calls = [];
        let value = { colnames: ["v"], vdata: [[1, 2]], error: "" };
        let failure;
        const executeRuntimeMethod = async function(request) {
            calls.push(request);
            if (failure) {
                throw failure;
            }

            return { status: "ready", value };
        };
        const browser = createBrowserImportAdapter({
            getWorkingDirectoryPath: () => "/runtime",
            ensureRuntime: async function() {
                throw new Error("An unstaged runtime path needs no browser file write.");
            },
            executeRuntimeMethod,
            importThroughRuntime: async () => { throw new Error("Preview must not import."); }
        });
        const readPreview = host === "native"
            ? (request) => previewImportFileWithRuntime(request, executeRuntimeMethod)
            : (request) => browser.readPreview(request);
        const request = {
            file: "/runtime/created.csv", command: "read.csv", nrows: 2,
            header: true, sep: ",", quote: "\"", dec: ".",
            "na.strings": "NA", skip: 1, "strip.white": true,
            "comment.char": "#", fileEncoding: "UTF-8"
        };
        assert.deepEqual(await readPreview(request), {
            status: "ready", error: "", colnames: ["v"], vdata: [["1", "2"]]
        }, host + " must delegate an unstaged path to the shared runtime preview.");
        assert.equal(calls[0].method, "workspace.import_file_preview");
        assert.deepEqual(calls[0].params, {
            path: request.file, reader: request.command, nrows: 2, binary: false,
            header: true, rowNames: 0, sep: ",", quote: "\"", dec: ".",
            naStrings: "NA", skip: 1, stripWhite: true, commentChar: "#",
            fileEncoding: "UTF-8"
        }, host);

        value = { error: "import-file-not-found" };
        assert.deepEqual(await readPreview({ ...request, file: "/runtime/missing.csv" }), {
            status: "ready", error: "import-file-not-found", colnames: [], vdata: []
        }, host + " must retain the runtime's missing-path result.");

        const beforeEmpty = calls.length;
        assert.deepEqual(await readPreview({ file: "" }), {
            status: "empty", error: "No file selected.", colnames: [], vdata: []
        }, host);
        assert.equal(calls.length, beforeEmpty);

        failure = new Error("Runtime preview transport failed.");
        await assert.rejects(readPreview(request), (error) => error === failure);
        failure = null;
        value = { colnames: ["v"], vdata: [[3]], error: "" };
        assert.deepEqual((await readPreview(request)).vdata, [["3"]]);
    }
};

const checkImportFailureResults = async function() {
    const previousModules = globalThis.dialogForgeProfileCustomJSModules;
    const originalConsoleError = console.error;
    const diagnostics = [];
    let api;

    try {
        globalThis.dialogForgeProfileCustomJSModules = [{
            extendCustomJSApi: (value) => { api = value; }
        }];
        console.error = (...args) => diagnostics.push(args);

        for (const host of ["native", "browser"]) {
            let failedChannel = "";
            let selection = {
                status: "selected",
                canceled: false,
                filePath: "/fixture/good.csv",
                message: "File selected."
            };
            const preview = {
                status: "ready", error: "", colnames: ["value"], vdata: [[1, 2]]
            };
            const failure = new Error("Synthetic transport failure: " + host);
            const openImportFile = async function() {
                if (failedChannel === dialogRuntimeIpcChannels.openImportFile) {
                    throw failure;
                }

                return selection;
            };
            const previewImportFile = async function() {
                if (failedChannel === dialogRuntimeIpcChannels.previewImportFile) {
                    throw failure;
                }

                return preview;
            };
            let invoke;

            if (host === "native") {
                const handlers = new Map();
                createProductDialogRuntimeIpcController({
                    ipcMain: {
                        on() {},
                        handle: (channel, callback) => handlers.set(channel, callback)
                    },
                    runtimeSessionManager: {},
                    getProductId: () => "base",
                    openImportFile,
                    previewImportFile,
                    ensureDependencies: async () => ({ ok: true, error: "" }),
                    executeVisibleCommand: async () => [],
                    broadcastRuntimeEvents: async () => {},
                    reportError() {}
                });
                invoke = (channel, ...args) => handlers.get(channel)({}, ...args);
            }
            else {
                const channels = createDialogChannelAdapter({ openImportFile, previewImportFile });
                invoke = (channel, ...args) => {
                    return channel === dialogRuntimeIpcChannels.openImportFile
                        ? channels.openImportFile()
                        : channels.previewImportFile(args[0]);
                };
            }

            await customJSRuntime.setup(
                { customJS: ";" },
                { objList: {}, radios: {}, dataframes: {}, events: new EventEmitter() },
                { invoke, on() {}, sendTo() {} }
            );
            assert.deepEqual(await api.openImportFile(), {
                ok: true, filePath: "/fixture/good.csv", cancelled: false, message: "File selected."
            }, host);
            assert.equal(await api.getImportPreview({ file: "/fixture/good.csv" }), preview);

            selection = { status: "canceled", canceled: true, filePath: "", message: "Canceled." };
            assert.deepEqual(await api.openImportFile(), {
                ok: false, filePath: "", cancelled: true, message: "Canceled."
            }, "User cancellation remains distinct from a failed host call.");

            failedChannel = dialogRuntimeIpcChannels.openImportFile;
            assert.deepEqual(await api.openImportFile(), {
                ok: false,
                filePath: "",
                cancelled: false,
                message: "File selection did not complete. Please try again."
            });
            failedChannel = dialogRuntimeIpcChannels.previewImportFile;
            assert.deepEqual(await api.getImportPreview({ file: "/fixture/good.csv" }), {
                status: "failed",
                error: "Import preview did not complete. Please try again.",
                colnames: [],
                vdata: []
            });
            assert.equal(diagnostics.at(-1)[1], failure,
                "Detailed host failure remains available in diagnostics, not lost in null.");
            failedChannel = "";
            assert.equal(await api.getImportPreview({ file: "/fixture/good.csv" }), preview,
                "A subsequent preview is not stuck in the failed result.");
        }

        assert.equal(diagnostics.length, 4);
    }
    finally {
        console.error = originalConsoleError;

        if (previousModules === undefined) {
            delete globalThis.dialogForgeProfileCustomJSModules;
        }
        else {
            globalThis.dialogForgeProfileCustomJSModules = previousModules;
        }
    }
};

const main = async function() {
    for (const host of ["native", "browser"]) {
        let scope = {};
        let release;
        const calls = [];
        const deliver = createDialogFilterStateDelivery({
            getSessionScope: () => scope,
            readFilterState: (dataset) => ({ dataset, command: "x > 1" }),
            refreshDialogs: async function(dataset) {
                calls.push(["refresh", dataset]);
                if (dataset === "delayed") {
                    await new Promise((resolve) => { release = resolve; });
                }
                return { status: dataset === "failed" ? "failed" : "delivered" };
            },
            publishFilterState: (payload) => { calls.push(["publish", payload]); },
            reportWarning: (message) => { calls.push(["warning", message]); }
        });
        await deliver("data");
        assert.deepEqual(calls, [["refresh", "data"], ["publish", {
            dataset: "data", filter: { dataset: "data", command: "x > 1" }
        }]], host);
        calls.length = 0;
        await deliver("");
        assert.deepEqual(calls, [["refresh", ""], ["publish", { dataset: "", filter: null }]]);
        calls.length = 0;
        await deliver("failed");
        assert.equal(calls[1][0], "warning");
        assert.match(calls[1][1], /Dialog controls could not refresh/);
        assert.equal(calls[2][0], "publish", "Refresh failure does not hide an accepted filter change.");
        calls.length = 0;
        const retired = deliver("delayed");
        scope = {};
        release();
        await retired;
        assert.deepEqual(calls, [["refresh", "delayed"]], "Retired delivery must not publish.");
        calls.length = 0;
        const older = deliver("delayed");
        await deliver("newer");
        release();
        await older;
        assert.deepEqual(calls.map((entry) => entry[0]), ["refresh", "refresh", "publish"]);
        assert.equal(calls[2][1].dataset, "newer");
    }
    const nativeState = createDialogBindingState();
    const browserState = createDialogBindingState();
    const native = createDialogExternalCallHost({ state: nativeState });
    const browser = createDialogChannelAdapter({
        handleStateCall: (name, parameters) => routeDialogStateCall(name, parameters, { state: browserState })
    });
    const calls = [
        ["getFilterState", { dataset: "data" }],
        ["setFilterState", { dataset: "data", command: "x > 1" }],
        ["setFilterState", { dataset: "data", command: "" }],
        ["getFilterState", { dataset: "data" }],
        ["setSplitByState", { dataset: "data", grouping: ["x"] }],
        ["setSplitByState", { dataset: "data", grouping: [] }],
        ["getSplitByState", { dataset: "data" }],
        ["setWeightByState", { dataset: "data", weighting: "w" }],
        ["setWeightByState", { dataset: "data", weighting: "" }],
        ["getWeightByState", { dataset: "data" }],
        ["inheritSubsetDatasetState", { source: "data", target: "subset", variables: ["x", "w"] }],
        ["clearFilterState", { dataset: "data" }],
        ["clearSplitByState", { dataset: "data" }],
        ["clearWeightByState", { dataset: "data" }]
    ];
    for (const [name, parameters] of calls) {
        const nativeResult = await native.call(name, parameters);
        const browserResult = await browser.callExternal({ name, parameters }, []);
        assert.deepEqual(browserResult.value, nativeResult.value, name);
        assert.deepEqual(browserState, nativeState, name);
        if (name === "getFilterState" && parameters.dataset === "data" && nativeState.filters.data) {
            assert.equal(nativeResult.value.command, "x > 1", "Empty setters retain state; clear is explicit.");
        }
        if (name === "getSplitByState") {
            assert.deepEqual(nativeResult.value, { dataset: "data", grouping: ["x"] });
        }
        if (name === "getWeightByState") {
            assert.equal(nativeResult.value.weighting, "w");
        }
    }

    for (const host of ["native", "browser"]) {
        let release;
        let started;
        const began = new Promise((resolve) => { started = resolve; });
        const gate = new Promise((resolve) => { release = resolve; });
        const options = {
            state: createDialogBindingState(),
            onFilterStateChanged: async () => { started(); await gate; }
        };
        let replied = false;
        const request = host === "native"
            ? createDialogExternalCallHost(options).call("setFilterState", { dataset: "data", command: "x > 1" })
            : createDialogChannelAdapter({
                handleStateCall: (name, parameters) => routeDialogStateCall(name, parameters, options)
            }).callExternal({ name: "setFilterState", parameters: { dataset: "data", command: "x > 1" } }, []);
        const completion = request.then((result) => { replied = true; return result; });
        await began;
        assert.equal(replied, false, "Do not reply with an unresolved state/delivery value.");
        release();
        assert.equal((await completion).value.command, "x > 1");
    }
    const handlers = new Map();
    let sharedConsoleNotifications = 0;
    let sharedFilterNotifications = 0;
    let duplicateIpcNotifications = 0;
    const wiredHost = createDialogExternalCallHost({
        state: createDialogBindingState(),
        onConsoleStateChanged: async () => { sharedConsoleNotifications += 1; },
        onFilterStateChanged: async () => { sharedFilterNotifications += 1; }
    });
    createDialogExternalCallIpcController({
        ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
        host: wiredHost,
        shouldPublishConsoleStateChips: () => true,
        readConsoleStateChips: async () => [],
        refreshConsoleStateChips: async () => { duplicateIpcNotifications += 1; }
    });
    const wiredResult = await handlers.get(dialogRuntimeIpcChannels.callExternal)(
        {}, "setSplitByState", { dataset: "data", grouping: ["x"] }
    );
    assert.equal(wiredResult.status, "ready");
    assert.equal(sharedConsoleNotifications, 1);
    assert.equal(sharedFilterNotifications, 1);
    assert.equal(duplicateIpcNotifications, 0, "IPC must not repeat shared state notification policy.");

    await checkImportFailureResults();
    await checkRuntimeImportPreviewPaths();
    await checkImportPreviewFallbackBoundary();
    await checkImportPreviewActivation();
    await checkDialogCommandReceipts();
    await checkDialogCommandActivation();
    await checkExternalCallActivation();
    console.log("Shared dialog state/import failure/runtime-path cases passed; physical/rendered acceptance remains separate.");
};
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

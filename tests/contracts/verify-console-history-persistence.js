"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const rootDir = process.cwd();
const compositionPath = path.join(rootDir, "shared/base-app/features/main-window/mainCompositionRoot.ts");
const consoleServicesPath = path.join(rootDir, "shared/base-app/features/main-window/mainConsoleServices.ts");
const preloadPath = path.join(rootDir, "shared/base-app/bootstrap/preload.ts");
const globalsPath = path.join(rootDir, "shared/base-app/bootstrap/dialogForgeGlobals.d.ts");
const ipcPath = path.join(rootDir, "shared/console/services/consoleHistoryIpcController.ts");
const ipcRoutesPath = path.join(rootDir, "shared/console/services/consoleHistoryIpc.ts");
const composition = [
    fs.readFileSync(compositionPath, "utf8"),
    fs.readFileSync(consoleServicesPath, "utf8")
].join("\n");
const preload = fs.readFileSync(preloadPath, "utf8");
const globals = fs.readFileSync(globalsPath, "utf8");
const ipcSource = [
    fs.readFileSync(ipcPath, "utf8"),
    fs.readFileSync(ipcRoutesPath, "utf8")
].join("\n");
const { createConsoleCommandHistory } = require("../../shared/console/services/consoleCommandHistory");
const { createConsoleHistorySettingsStore } = require("../../shared/console/services/consoleHistorySettingsStore");
let settings = {};
const store = createConsoleHistorySettingsStore({
    defaultProductId: "base",
    defaultRuntimeId: "none",
    maximumItems: 3,
    readSettings: function () {
        return settings;
    },
    writeSettings: function (nextSettings) {
        settings = nextSettings;
    }
});
store.write({
    productId: "StatsProduct",
    runtimeId: "r",
    history: ["one", "two", "three", "four"]
});
store.write({
    productId: "QcaProduct",
    runtimeId: "r",
    history: ["qca"]
});
assert.deepStrictEqual(store.read({
    productId: "StatsProduct",
    runtimeId: "r"
}), ["two", "three", "four"], "settings-backed history must trim the oldest commands");
assert.deepStrictEqual(store.read({
    productId: "QcaProduct",
    runtimeId: "r"
}), ["qca"], "settings-backed history must remain scoped by product and runtime");
let persistedHistory = [];
const history = createConsoleCommandHistory({
    maximumItems: 3,
    readHistory: async function () {
        return [
            "first",
            '{ cat("__DIALOGFORGE_DATASET_READY_123__", "\\n") }',
            "second"
        ];
    },
    writeHistory: function (request) {
        persistedHistory = request.history;
    },
    excludeFromHistory: function (command) {
        return command.includes("__DIALOGFORGE_DATASET_READY_");
    }
});
const verifyHistory = async function () {
    await history.load({
        productId: "StatsProduct",
        runtimeId: "r"
    });
    assert.deepStrictEqual(history.getInputHistory(), ["first", "second"], "history loading must remove internal runtime commands");
    assert.deepStrictEqual(persistedHistory, ["first", "second"], "filtered history must be persisted back to settings");
    history.record("third");
    history.record("fourth");
    history.record('{ cat("__DIALOGFORGE_DATASET_READY_456__", "\\n") }');
    assert.deepStrictEqual(history.getInputHistory(), ["second", "third", "fourth"], "recorded history must stay bounded and exclude internal commands");
    assert.deepStrictEqual(history.navigate(-1), {
        changed: true,
        value: "fourth"
    }, "history navigation must start with the newest user command");
    [
        "readConsoleHistory: function(input",
        "writeConsoleHistory: function(input",
        "consoleHistoryIpcChannels.read",
        "consoleHistoryIpcChannels.write"
    ].forEach((expected) => {
        assert.ok(preload.includes(expected), "preload must expose console history behavior: " + expected);
    });
    [
        "readConsoleHistory(input",
        "writeConsoleHistory(input"
    ].forEach((expected) => {
        assert.ok(globals.includes(expected), "global types must expose console history behavior: " + expected);
    });
    assert.ok(ipcSource.includes('"base-app:readConsoleHistory"') &&
        ipcSource.includes('"base-app:writeConsoleHistory"'), "main process must register settings-backed console history IPC");
    assert.ok(composition.includes("createConsoleCommandHistory") &&
        composition.includes('command.includes("__DIALOGFORGE_DATASET_READY_")'), "renderer composition must filter internal runtime commands from history");
    console.log("Console history persistence contract verified.");
};
void verifyHistory();

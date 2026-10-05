"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const {
    createApplicationSettingsLifecycle,
    readApplicationSettingsLocale,
    runApplicationSettingsOperation
} = require("../dist/src/base-app/features/settings/applicationSettingsLifecycle");
const { createApplicationSettingsPayload } = require("../dist/src/base-app/features/settings/applicationSettingsPayload");
const {
    createApplicationSettingsIpcController
} = require("../dist/src/shell-electron/settings/applicationSettingsIpcController");
const {
    createSettingsWindowController
} = require("../dist/src/shell-electron/settings/settingsWindowController");
const {
    createBrowserPreloadChannelBridge
} = require("../dist/src/shell-web/browserPreloadChannelBridge");
const {
    applicationSettingsEventChannels
} = require("../dist/src/base-app/features/settings/applicationSettingsIpc");

const checkSettingsMessageFailures = async function() {
    for (const operationName of ["previewSettings", "cancelSettingsPreview", "saveSettings"]) {
        const channel = applicationSettingsEventChannels[operationName];
        const failure = new Error(`synthetic ${operationName} failure`);
        const nativeFailures = [];
        const callbacks = new Map();
        let rejectOperation = true;
        let nativeSaved = 0;
        const nativeWindow = { isDestroyed: () => false, webContents: {} };
        const nativeController = createApplicationSettingsIpcController({
            ipcMain: {
                handle() {},
                on: (name, callback) => callbacks.set(name, callback)
            },
            readSettings: function() {
                if (rejectOperation && operationName !== "saveSettings") {
                    throw failure;
                }

                return {};
            },
            writeSettings: function() {
                if (rejectOperation) {
                    throw failure;
                }
            },
            visibleRuntimeProviderIds: ["r"],
            defaultRuntimeProvider: "r",
            setSettingsPreview() {},
            applyLanguage() {},
            sendToAllWindows() {},
            installApplicationMenu() {},
            reportSettingsFailure: (message) => nativeFailures.push(message),
            settingsWindowController: {
                getWindow: () => nativeWindow,
                notifySaved: () => { nativeSaved += 1; }
            }
        });
        const sendNative = () => callbacks.get(channel)({ sender: nativeWindow.webContents }, {});
        assert.doesNotThrow(sendNative, "Native fire-and-forget failures cannot escape IPC.");
        assert.deepEqual(nativeFailures, [failure.message]);
        assert.equal(nativeSaved, 0, "Rejected Save cannot acknowledge success.");
        rejectOperation = false;
        sendNative();
        assert.equal(nativeFailures.length, 1, "Retry must not repeat an old error.");
        assert.equal(nativeSaved, operationName === "saveSettings" ? 1 : 0);

        if (operationName === "cancelSettingsPreview") {
            rejectOperation = true;
            assert.doesNotThrow(() => nativeController.cancelSettingsPreview());
            assert.deepEqual(nativeFailures, [failure.message, failure.message]);
        }

        for (const asynchronous of [false, true]) {
            const browserFailures = [];
            let browserSaved = 0;
            let rejectBrowserOperation = true;
            const sourceWindow = {};
            const browserOperation = function(_input, source) {
                if (operationName === "saveSettings") {
                    assert.equal(source, sourceWindow, "Keep the originating settings frame.");
                }

                if (rejectBrowserOperation) {
                    if (asynchronous) {
                        return Promise.reject(failure);
                    }

                    throw failure;
                }

                if (operationName === "saveSettings") {
                    browserSaved += 1;
                }
            };
            const browser = createBrowserPreloadChannelBridge({
                isCurrentSettingsSource: (source) => source === sourceWindow,
                [operationName]: browserOperation,
                appendMessage: (message, className) => {
                    browserFailures.push([message, className]);
                }
            });
            assert.doesNotThrow(() => browser.send(channel, [{}], sourceWindow));
            await Promise.resolve();
            assert.deepEqual(browserFailures, [[failure.message, "web-transcript__line--stderr"]]);
            assert.equal(browserSaved, 0);
            rejectBrowserOperation = false;
            browser.send(channel, [{}], sourceWindow);
            await Promise.resolve();
            assert.equal(browserFailures.length, 1);
            assert.equal(browserSaved, operationName === "saveSettings" ? 1 : 0);
        }
    }

    const failures = [];
    runApplicationSettingsOperation(
        () => Promise.reject("non-Error rejection"),
        (message) => failures.push(message)
    );
    await Promise.resolve();
    assert.deepEqual(failures, ["non-Error rejection"]);
};

const checkSettingsSaveOwnership = async function() {
    for (const providerId of ["r", "webr"]) {
        for (const disposition of ["retained", "closed", "replaced", "failed"]) {
            const target = {};
            let currentSurface = target;
            let finishApply;
            let failApply;
            let writes = 0;
            let notifications = 0;
            const lifecycle = createApplicationSettingsLifecycle({
                readSettings: () => ({}),
                writeSettings: () => { writes += 1; },
                visibleRuntimeProviderIds: () => [providerId],
                defaultRuntimeProvider: () => providerId,
                setPreview() {},
                applyLive: () => new Promise((resolve, reject) => {
                    finishApply = resolve;
                    failApply = reject;
                })
            });
            const pending = lifecycle.save({}, () => {
                notifications += 1;
            }, () => currentSurface === target);
            assert.equal(writes, 1);
            assert.equal(notifications, 0);

            if (disposition === "closed") {
                currentSurface = null;
            }
            else if (disposition === "replaced") {
                currentSurface = {};
            }

            if (disposition === "failed") {
                failApply(new Error("synthetic live application failure"));
                await assert.rejects(pending, /synthetic live application failure/);
            }
            else {
                finishApply();
                await pending;
            }

            assert.equal(notifications, disposition === "retained" ? 1 : 0,
                `${providerId}: only the still-current successful Save may acknowledge`);
            let admitted = false;
            lifecycle.save({}, () => { admitted = true; }, () => false);
            assert.equal(writes, 1, "Retired requests must not write settings.");
            assert.equal(admitted, false);
        }
    }

    const callbacks = new Map();
    const original = { isDestroyed: () => false, webContents: {} };
    const replacement = { isDestroyed: () => false, webContents: {} };
    let current = original;
    let writes = 0;
    let notifications = 0;
    createApplicationSettingsIpcController({
        ipcMain: { handle() {}, on: (name, callback) => callbacks.set(name, callback) },
        readSettings: () => ({}),
        writeSettings: () => { writes += 1; },
        visibleRuntimeProviderIds: ["r"],
        defaultRuntimeProvider: "r",
        setSettingsPreview() {},
        applyLanguage: () => { current = replacement; },
        sendToAllWindows() {},
        installApplicationMenu() {},
        reportSettingsFailure: (message) => assert.fail(message),
        settingsWindowController: {
            getWindow: () => current,
            notifySaved: () => { notifications += 1; }
        }
    });
    const save = callbacks.get(applicationSettingsEventChannels.saveSettings);
    save({ sender: {} }, {});
    assert.equal(writes, 0, "Foreign senders must not save current Settings.");
    save({ sender: original.webContents }, {});
    assert.equal(writes, 1);
    assert.equal(notifications, 0, "Never notify a replacement native window.");
    save({ sender: original.webContents }, {});
    assert.equal(writes, 1, "Retired native senders must not write settings.");
    current = null;
    save({ sender: replacement.webContents }, {});
    assert.equal(writes, 1, "A request after close must not write settings.");
};

const checkSettingsMessageOwnership = function() {
    const first = { isDestroyed: () => false, webContents: {} };
    const replacement = { isDestroyed: () => false, webContents: {} };
    let current = first;
    let liveCalls = 0;
    const callbacks = new Map();
    createApplicationSettingsIpcController({
        ipcMain: { handle() {}, on: (name, callback) => callbacks.set(name, callback) },
        readSettings: () => ({}),
        writeSettings() {},
        visibleRuntimeProviderIds: ["r"], defaultRuntimeProvider: "r",
        setSettingsPreview() {},
        applyLanguage: () => { liveCalls += 1; },
        sendToAllWindows() {}, installApplicationMenu() {},
        reportSettingsFailure: (message) => assert.fail(message),
        settingsWindowController: { getWindow: () => current, notifySaved() {} }
    });
    for (const name of ["previewSettings", "cancelSettingsPreview"]) {
        const send = callbacks.get(applicationSettingsEventChannels[name]);
        send({ sender: first.webContents }, {});
        const acceptedCalls = liveCalls;
        current = replacement;
        send({ sender: first.webContents }, {});
        send({ sender: {} }, {});
        current = null;
        send({ sender: first.webContents }, {});
        assert.equal(liveCalls, acceptedCalls, "Retired Preview/Cancel must not apply settings.");
        current = first;
    }

    let browserSource = first;
    const deliveries = [];
    const browser = createBrowserPreloadChannelBridge({
        isCurrentSettingsSource: (source) => !!source && source === browserSource,
        previewSettings: () => { deliveries.push("preview"); },
        cancelSettingsPreview: () => { deliveries.push("cancel"); },
        saveSettings: () => { deliveries.push("save"); },
        closeSettingsWindow: () => { deliveries.push("close"); },
        appendMessage: (message) => assert.fail(message)
    });
    for (const name of ["previewSettings", "cancelSettingsPreview", "saveSettings", "closeSettingsWindow"]) {
        const channel = applicationSettingsEventChannels[name];
        browser.send(channel, [{}], first);
        const acceptedDeliveries = deliveries.length;
        browserSource = replacement;
        browser.send(channel, [{}], first);
        browser.send(channel, [{}], null);
        assert.equal(deliveries.length, acceptedDeliveries,
            "Retired browser settings messages cannot change or close a replacement.");
        browser.send(channel, [{}], replacement);
        assert.equal(deliveries.length, acceptedDeliveries + 1);
        browserSource = first;
    }

    const windows = [];
    let cleanupCalls = 0;
    const controller = createSettingsWindowController({
        createWindow: function() {
            const events = new Map();
            const win = {
                events, isDestroyed: () => false, setMenu() {}, focus() {},
                on: (name, callback) => events.set(name, callback),
                webContents: { once() {}, send() {} },
                loadFile: async () => {}
            };
            windows.push(win);
            return win;
        },
        readPayload: () => ({}), pagePath: "settings.html",
        onClosed: () => { cleanupCalls += 1; }
    });
    controller.open();
    windows[0].events.get("closed")();
    assert.equal(cleanupCalls, 1);
    controller.open();
    windows[0].events.get("closed")();
    assert.equal(cleanupCalls, 1, "Retired close cleanup must not cancel a replacement Preview.");
    assert.equal(controller.getWindow(), windows[1]);

    const failures = [];
    runApplicationSettingsOperation(
        () => assert.fail("Invalid owner cannot run an operation"),
        (message) => failures.push(message),
        () => { throw new Error("synthetic owner lookup failure"); }
    );
    assert.deepEqual(failures, ["synthetic owner lookup failure"]);
};

const checkRequirementSaveFailuresAndOwnership = function() {
    for (const disposition of [
        "success", "readFailure", "invalidPackages", "writeFailure", "notifyFailure",
        "foreign", "closed", "replacedDuringRead", "replacedDuringWrite"
    ]) {
        let mode = disposition;
        const callbacks = new Map();
        const failures = [];
        const notifications = [];
        const writes = [];
        const target = {
            webContents: {}, isDestroyed: () => mode === "closed"
        };
        const replacement = { webContents: {}, isDestroyed: () => false };
        let currentWindow = target;
        let reads = 0;
        createApplicationSettingsIpcController({
            ipcMain: {
                handle() {}, on: (channel, callback) => callbacks.set(channel, callback)
            },
            dialogRuntimeRequirementsWindowController: {
                getWindow: () => currentWindow,
                notifySaved: function(payload) {
                    if (mode === "notifyFailure") {
                        throw new Error("synthetic requirement notification failure");
                    }
                    notifications.push(payload);
                }
            },
            readSettings: function() {
                reads += 1;
                if (mode === "readFailure") {
                    throw new Error("synthetic requirement read failure");
                }
                if (mode === "replacedDuringRead") {
                    currentWindow = replacement;
                }
                return { defaultLanguage: "de_DE", dialogRuntimeRequirements: {} };
            },
            writeSettings: function(settings) {
                if (mode === "writeFailure") {
                    throw new Error("synthetic requirement storage failure");
                }
                writes.push(settings);
                if (mode === "replacedDuringWrite") {
                    currentWindow = replacement;
                }
            },
            reportSettingsFailure: (message) => failures.push(message),
            visibleRuntimeProviderIds: ["r"], defaultRuntimeProvider: "r"
        });
        const receive = callbacks.get(
            applicationSettingsEventChannels.saveDialogRuntimeRequirements
        );
        const event = { sender: disposition === "foreign" ? {} : target.webContents };
        assert.doesNotThrow(() => receive(event, {
            requestId: 1, dialogId: "fixture",
            rPackages: mode === "invalidPackages" ? "bad!" : "declared"
        }), `RQ07/RQ08 ${disposition}: fire-and-forget failures remain contained`);
        if (["readFailure", "invalidPackages", "writeFailure", "notifyFailure"].includes(mode)) {
            assert.equal(failures.length, 1);
        }
        else {
            assert.deepEqual(failures, []);
        }
        const persisted = ["success", "notifyFailure", "replacedDuringWrite"].includes(mode);
        assert.equal(writes.length, persisted ? 1 : 0, disposition);
        assert.equal(notifications.length, mode === "success" ? 1 : 0, disposition);
        if (["foreign", "closed"].includes(mode)) {
            assert.equal(reads, 0, "An unowned request cannot even read stored settings.");
        }
        if (persisted) {
            assert.equal(writes[0].defaultLanguage, "de_DE");
            assert.equal(writes[0].dialogRuntimeRequirements.fixture.rPackages[0].name,
                "declared");
        }

        const previousFailures = failures.length;
        const previousWrites = writes.length;
        const previousNotifications = notifications.length;
        mode = "success";
        currentWindow = target;
        receive({ sender: target.webContents }, {
            requestId: 2, dialogId: "fixture", rPackages: "admisc"
        });
        assert.equal(failures.length, previousFailures, "A valid retry adds no old failure.");
        assert.equal(writes.length, previousWrites + 1);
        assert.equal(notifications.length, previousNotifications + 1);
        assert.equal(notifications.at(-1).rPackages[0].name, "admisc");
        assert.equal(notifications.at(-1).requestId, 2, "Echo the accepted request identity.");
        for (const requestId of [undefined, 0, -1, 1.5, Number.NaN]) {
            receive({ sender: target.webContents }, {
                requestId, dialogId: "fixture", rPackages: "admisc"
            });
        }
        assert.equal(writes.length, previousWrites + 1,
            "RQ11 unidentified/invalid request identities cannot persist.");
    }
};

const checkMenuSaveFailuresAndOwnership = function() {
    for (const disposition of [
        "success", "foreign", "closed", "readFailure", "invalidDependencies",
        "writeFailure", "installFailure", "notifyFailure",
        "replacedDuringRead", "replacedDuringWrite"
    ]) {
        const callbacks = new Map();
        const failures = [];
        const writes = [];
        const acknowledgements = [];
        let reads = 0;
        let installs = 0;
        const target = {
            webContents: {}, isDestroyed: () => disposition === "closed"
        };
        const replacement = { webContents: {}, isDestroyed: () => false };
        let currentWindow = target;
        createApplicationSettingsIpcController({
            ipcMain: {
                handle() {}, on: (name, callback) => callbacks.set(name, callback)
            },
            menuCustomizationWindowController: {
                getWindow: () => currentWindow,
                notifySaved: function(payload) {
                    if (disposition === "notifyFailure") {
                        throw new Error("synthetic menu notification failure");
                    }
                    acknowledgements.push(payload);
                }
            },
            readSettings: function() {
                reads += 1;
                if (disposition === "readFailure") {
                    throw new Error("synthetic menu settings read failure");
                }
                if (disposition === "replacedDuringRead") {
                    currentWindow = replacement;
                }
                return { defaultLanguage: "de_DE", dialogRuntimeRequirements: {} };
            },
            writeSettings: function(settings) {
                if (disposition === "writeFailure") {
                    throw new Error("synthetic menu storage failure");
                }
                writes.push(settings);
                if (disposition === "replacedDuringWrite") {
                    currentWindow = replacement;
                }
            },
            installApplicationMenu: function() {
                installs += 1;
                if (disposition === "installFailure") {
                    throw new Error("synthetic menu installation failure");
                }
            },
            reportSettingsFailure: (message) => failures.push(message),
            // Never let a fixture write a real product repository.
            isPackagedApp: true, productLocation: { id: "fixture", source: "base" },
            visibleRuntimeProviderIds: ["r"], defaultRuntimeProvider: "r"
        });
        const menu = [{
            id: "fixture", name: "Fixture", type: "dialog",
            dependencies: disposition === "invalidDependencies" ? "bad!" : "declared"
        }];
        const receive = callbacks.get(applicationSettingsEventChannels.saveMenuCustomization);
        assert.doesNotThrow(() => receive({
            sender: disposition === "foreign" ? {} : target.webContents
        }, { requestId: 1, menu, runtimeProvider: "r" }), `MC06/MC07 ${disposition}`);
        const persisted = ["success", "installFailure", "notifyFailure",
            "replacedDuringWrite"].includes(disposition);
        assert.equal(writes.length, persisted ? 1 : 0, disposition);
        assert.equal(installs, persisted ? 1 : 0, disposition);
        assert.equal(acknowledgements.length, disposition === "success" ? 1 : 0);
        if (disposition === "success") {
            assert.equal(acknowledgements[0].requestId, 1);
            for (const requestId of [undefined, 0, -1, 1.5, Number.NaN]) {
                receive({ sender: target.webContents }, { requestId, menu, runtimeProvider: "r" });
            }
            assert.equal(writes.length, 1, "MC12 reject unidentified/invalid menu Save.");
            assert.equal(acknowledgements.length, 1);
        }
        const failed = ["readFailure", "invalidDependencies", "writeFailure",
            "installFailure", "notifyFailure"].includes(disposition);
        assert.equal(failures.length, failed ? 1 : 0, disposition);
        if (["foreign", "closed", "invalidDependencies"].includes(disposition)) {
            assert.equal(reads, 0, "Unowned/invalid menu saves cannot read settings.");
        }
        if (persisted) {
            assert.equal(writes[0].defaultLanguage, "de_DE");
            assert.ok(Object.values(writes[0]).includes(menu), "Keep product-scoped arrangement.");
            assert.equal(writes[0].dialogRuntimeRequirements.fixture.rPackages[0].name,
                "declared");
        }
    }
};

const checkMenuBrowseOwnership = async function() {
    const controllerPath = path.join(__dirname,
        "../dist/src/shell-electron/settings/applicationSettingsIpcController.js");
    const source = fs.readFileSync(controllerPath, "utf8");
    const requireController = createRequire(controllerPath);
    for (const platform of ["darwin", "win32", "linux"]) {
        const cases = ["success", "foreign", "closed", "cancelPicker", "pickerFailure",
            "replacePicker", "replaceOverwrite", "cancelOverwrite", "importFailure",
            "errorDialogFailure", "replaceImport"];
        if (platform !== "darwin") {
            cases.push("replaceKind", "cancelKind");
        }
        for (const disposition of cases) {
            const callbacks = new Map();
            const failures = [];
            const notifications = [];
            const panels = [];
            let plans = 0;
            let imports = 0;
            const target = { webContents: {}, isDestroyed: () => disposition === "closed" };
            const replacement = { webContents: {}, isDestroyed: () => false };
            let currentWindow = target;
            const context = vm.createContext({
                exports: {}, process: { platform }, Error,
                require: function(id) {
                    if (id === "fs") {
                        return { existsSync: () => true };
                    }
                    if (id === "./dialogPackageImport") {
                        return {
                            planDialogPackageImport() {
                                plans += 1;
                                return { targetDirectory: "/fixture-only/no-actual-write" };
                            },
                            importDialogPackage() {
                                imports += 1;
                                if (["importFailure", "errorDialogFailure"].includes(disposition)) {
                                    throw new Error("synthetic invalid dialog package");
                                }
                                if (disposition === "replaceImport") {
                                    currentWindow = replacement;
                                }
                                return { id: "fixture", label: "Fixture", definition: {} };
                            }
                        };
                    }
                    return requireController(id);
                }
            });
            // Real compiled IPC handler; only platform dialogs and import/FS
            // mechanics are fixtures. Never run a copied ownership algorithm.
            vm.runInContext(source, context, { filename: controllerPath });
            context.exports.createApplicationSettingsIpcController({
                ipcMain: {
                    handle() {}, on: (name, callback) => callbacks.set(name, callback)
                },
                menuCustomizationWindowController: {
                    getWindow: () => currentWindow,
                    notifyDialogBrowsed: (payload) => notifications.push(payload)
                },
                dialog: {
                    showOpenDialog: async function(owner) {
                        assert.equal(owner, target);
                        panels.push("picker");
                        if (disposition === "pickerFailure") {
                            throw new Error("synthetic picker failure");
                        }
                        if (disposition === "replacePicker") {
                            currentWindow = replacement;
                        }
                        return { canceled: disposition === "cancelPicker", filePaths: ["fixture"] };
                    },
                    showMessageBox: async function(owner, input) {
                        assert.equal(owner, target);
                        panels.push(input.title);
                        if (input.type === "error") {
                            if (disposition === "errorDialogFailure") {
                                throw new Error("synthetic error dialog failure");
                            }
                            return { response: 0 };
                        }
                        const kind = input.title === "Import dialog";
                        if (disposition === (kind ? "replaceKind" : "replaceOverwrite")) {
                            currentWindow = replacement;
                        }
                        return { response: disposition === (kind ? "cancelKind" : "cancelOverwrite")
                            ? 0 : 1 };
                    }
                },
                reportSettingsFailure: (message) => failures.push(message),
                translate: (text) => text, defaultRuntimeProvider: "r",
                visibleRuntimeProviderIds: ["r"], productLocation: { id: "fixture" }
            });
            callbacks.get(applicationSettingsEventChannels.browseMenuDialog)({
                sender: disposition === "foreign" ? {} : target.webContents
            });
            await new Promise((resolve) => setImmediate(resolve));
            assert.equal(notifications.length, disposition === "success" ? 1 : 0,
                `MC08/MC09 ${platform}/${disposition}: publish only into retained owner`);
            const imported = ["success", "importFailure", "errorDialogFailure", "replaceImport"];
            assert.equal(imports, imported.includes(disposition) ? 1 : 0);
            assert.equal(failures.length,
                ["pickerFailure", "errorDialogFailure"].includes(disposition) ? 1 : 0);
            if (["foreign", "closed", "replaceKind", "cancelKind"].includes(disposition)) {
                assert.ok(!panels.includes("picker"));
            }
            if (["foreign", "closed", "replaceKind", "cancelKind", "replacePicker",
                "cancelPicker", "pickerFailure"].includes(disposition)) {
                assert.equal(plans, 0, "Do not plan/import after a retired/cancelled picker.");
            }
            if (["importFailure", "errorDialogFailure"].includes(disposition)) {
                assert.ok(panels.includes("Error"), "Retain the current-window import error dialog.");
            }
        }
    }
};

const main = async function() {
    await checkMenuBrowseOwnership();
    checkMenuSaveFailuresAndOwnership();
    checkRequirementSaveFailuresAndOwnership();
    checkSettingsMessageOwnership();
    await checkSettingsMessageFailures();
    await checkSettingsSaveOwnership();
    for (const providerId of ["r", "webr"]) {
        const settings = {
            defaultLanguage: "ro_RO",
            runtimeStartup: { providerId: "future-provider" }
        };
        const payload = createApplicationSettingsPayload({
            settings,
            defaultRuntimeProvider: providerId,
            selectedRuntimeProvider: providerId,
            locales: [{ code: "ro_RO", label: "Romanian" }],
            runtimeProviders: [{ id: providerId, label: "R" }],
            runtimeLocationStates: {},
            strings: { Settings: "Settings" }
        });

        assert.equal(payload.settings, settings, "Preview settings are preserved");
        assert.equal(payload.selectedRuntimeProvider, providerId);
        assert.equal(payload.factorySettings.runtimeStartup.providerId, providerId,
            "Reset uses the composition default, not a saved next-start choice");
        assert.equal(settings.runtimeStartup.providerId, "future-provider");
        assert.deepEqual(payload.locales, [{ code: "ro_RO", label: "Romanian" }]);
    }

    for (const asynchronous of [false, true]) {
        const calls = [];
        let saved = {
            defaultLanguage: "en_US", languageNS: "en_US",
            terminalSettings: { fontFamily: "original", cursorStyle: "bar" },
            runtimeStartup: { providerId: "r" }
        };
        let preview = null;
        const lifecycle = createApplicationSettingsLifecycle({
            readSettings: () => saved,
            writeSettings: (settings) => { saved = settings; calls.push("write"); },
            visibleRuntimeProviderIds: () => ["r", "webr"],
            defaultRuntimeProvider: () => "r",
            setPreview: (settings) => { preview = settings; calls.push("preview"); },
            applyLive: (settings) => {
                calls.push(["live", readApplicationSettingsLocale(settings)]);
                if (asynchronous) {
                    return Promise.resolve().then(() => { calls.push("applied"); });
                }
            }
        });

        await lifecycle.preview({ defaultLanguage: "ro_RO", terminalSettings: { fontFamily: "preview" } });
        assert.equal(preview.terminalSettings.fontFamily, "preview");
        assert.equal(preview.terminalSettings.cursorStyle, "bar");
        assert.equal(saved.terminalSettings.fontFamily, "original");
        assert.equal(saved.defaultLanguage, "en_US");
        await lifecycle.cancel();
        assert.equal(preview, null);
        assert.deepEqual(calls.filter(Array.isArray).at(-1), ["live", "en_US"]);

        calls.length = 0;
        const pending = lifecycle.save({
            defaultLanguage: "ro_RO", runtimeStartup: { providerId: "unknown" }
        }, () => { calls.push("saved"); });
        if (asynchronous) {
            assert.ok(!calls.includes("saved"), "Wait for live application before acknowledging save");
        }
        else {
            assert.equal(calls.at(-1), "saved", "Native synchronous notification stays synchronous");
        }
        await pending;
        assert.equal(preview, null);
        assert.equal(saved.defaultLanguage, "ro_RO");
        assert.equal(saved.languageNS, "ro_RO");
        assert.equal(saved.runtimeStartup.providerId, "r");
        assert.equal(calls.at(-1), "saved");
    }

    let notified = false;
    const failed = createApplicationSettingsLifecycle({
        readSettings: () => ({}), writeSettings() {},
        visibleRuntimeProviderIds: () => ["r"], defaultRuntimeProvider: () => "r",
        setPreview() {}, applyLive: async () => { throw new Error("live failure"); }
    });
    await assert.rejects(failed.save({}, () => { notified = true; }), /live failure/);
    assert.equal(notified, false);

    for (const providerId of ["r", "webr"]) {
        let saved = { defaultLanguage: "en_US", languageNS: "en_US" };
        let preview;
        let rejectWrite = true;
        let liveCalls = 0;
        let saveNotifications = 0;
        const writeFailure = new Error("synthetic settings storage rejection");
        const retryable = createApplicationSettingsLifecycle({
            readSettings: () => saved,
            writeSettings: function(settings) {
                if (rejectWrite) {
                    throw writeFailure;
                }

                saved = settings;
            },
            visibleRuntimeProviderIds: () => [providerId],
            defaultRuntimeProvider: () => providerId,
            setPreview: (settings) => { preview = settings; },
            applyLive: () => { liveCalls += 1; }
        });
        retryable.preview({ defaultLanguage: "de_DE" });
        const activePreview = preview;
        assert.throws(() => retryable.save({ defaultLanguage: "de_DE" }, () => {
            saveNotifications += 1;
        }), (error) => error === writeFailure);
        assert.equal(preview, activePreview,
            `${providerId}: a rejected write must retain the live unsaved preview`);
        assert.equal(saved.defaultLanguage, "en_US");
        assert.equal(liveCalls, 1, "Failed persistence does not reapply live settings.");
        assert.equal(saveNotifications, 0, "Failed persistence cannot acknowledge Save.");

        rejectWrite = false;
        retryable.save({ defaultLanguage: "de_DE" }, () => {
            saveNotifications += 1;
        });
        assert.equal(preview, null);
        assert.equal(saved.defaultLanguage, "de_DE");
        assert.equal(saved.languageNS, "de_DE");
        assert.equal(liveCalls, 2);
        assert.equal(saveNotifications, 1);
    }
    console.log("Shared settings lifecycle cases passed.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});

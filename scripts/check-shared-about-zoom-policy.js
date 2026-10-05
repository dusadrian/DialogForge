"use strict";

const assert = require("node:assert/strict");
const { createAboutPayload } = require("../dist/src/base-app/features/about/aboutPayload");
const {
    clampMainZoomFactor, readMainZoomShortcut, nextMainZoomFactor,
    readMainZoomMenuAction
} = require("../dist/src/base-app/features/main-window/mainZoomPolicy");
const {
    createApplicationMenuTemplate
} = require("../dist/src/shell-electron/menus/applicationMenu");
const {
    createMainWindowZoomController
} = require("../dist/src/shell-electron/windows/mainWindowZoomController");
const {
    createMainZoomState
} = require("../dist/src/base-app/features/main-window/mainZoomState");
const {
    createBrowserZoomAdapter
} = require("../dist/src/shell-web/browserZoomAdapter");
const {
    bindElectronApplicationLifecycle
} = require("../dist/src/shell-electron/lifecycle/electronApplicationLifecycle");

const windowLifecycle = new Map();
const auxiliaryWindows = ["main", "dataset", "plot"].map((name) => ({
    name,
    handlers: new Map(),
    isDestroyed: () => false,
    webContents: {
        on: function(event, callback) {
            this.owner.handlers.set(event, callback);
        },
        setZoomFactor() {},
        send() {}
    }
}));
auxiliaryWindows.forEach((win) => { win.webContents.owner = win; });
const auxiliarySaves = [];
const auxiliaryZoom = createMainWindowZoomController({
    defaultZoomFactor: 1,
    readStoredZoomFactor: () => 1,
    persistZoomFactor: (value) => auxiliarySaves.push(value),
    listWindows: () => auxiliaryWindows
});
auxiliaryZoom.initialize();
bindElectronApplicationLifecycle({
    app: {
        whenReady: () => new Promise(() => {}),
        on: (event, callback) => windowLifecycle.set(event, callback)
    },
    bindWindowZoom: auxiliaryZoom.bindShortcuts
});
const bindCreatedWindow = windowLifecycle.get("browser-window-created");
assert.equal(typeof bindCreatedWindow, "function",
    "Every task-owned native window must receive the SAME shortcut adapter.");
auxiliaryWindows.forEach((win) => bindCreatedWindow({}, win));
let preventedShortcuts = 0;
auxiliaryWindows.forEach((win) => {
    const onInput = win.handlers.get("before-input-event");
    assert.equal(typeof onInput, "function", win.name);
    onInput({ preventDefault: () => { preventedShortcuts += 1; } }, {
        type: "keyDown", key: "-", meta: true
    });
});
assert.equal(preventedShortcuts, 3);
assert.deepEqual(auxiliarySaves, [0.9, 0.8, 0.7000000000000001],
    "Main and auxiliary shortcuts update ONE shared zoom state, not per-window state.");

for (const host of ["electron", "browser"]) {
    const deliveries = [];
    const saves = [];
    const state = createMainZoomState({
        readStoredZoomFactor: () => 3,
        deliverZoomFactor: (value) => deliveries.push(value),
        persistZoomFactor: (value) => saves.push(value)
    });
    assert.equal(state.initialize(), 3, host);
    state.execute("in");
    assert.deepEqual(deliveries, [], `${host}: upper limit is a no-op`);
    assert.deepEqual(saves, []);
    state.apply(0.5);
    state.execute("out");
    assert.deepEqual(deliveries, [0.5], `${host}: lower limit is a no-op`);
    state.execute("reset");
    state.execute("reset");
    assert.deepEqual(saves, [1, 1], `${host}: explicit reset still delivers`);
    state.apply(NaN);
    assert.equal(state.readZoomFactor(), 1);
}

const browserSaves = [];
const browserDeliveries = [];
let browserSettings = { dialogZoomFactor: 3 };
const browserZoom = createBrowserZoomAdapter({
    document: {
        querySelectorAll: () => [],
        documentElement: { style: { setProperty() {} } },
        body: { style: {
            set zoom(value) { browserDeliveries.push(Number(value)); }
        } }
    },
    window: { location: { origin: "https://example.invalid" } },
    storage: {
        readSettings: () => browserSettings,
        writeSettings: (value) => {
            browserSettings = value;
            browserSaves.push(value.dialogZoomFactor);
        }
    }
});
browserZoom.execute("in");
assert.deepEqual(browserDeliveries, []);
assert.deepEqual(browserSaves, []);
browserZoom.apply(0.5, { persist: false });
browserZoom.execute("out");
assert.deepEqual(browserDeliveries, [0.5]);
assert.deepEqual(browserSaves, []);
browserZoom.execute("reset");
assert.deepEqual(browserSaves, [1]);

for (const host of ["electron", "browser"]) {
    const payload = createAboutPayload({
        about: { body: ["A body"], copyrightStartYear: 2020, authorName: "Author" },
        productName: "Product", version: "1.2.3", currentYear: 2026,
        translate: function(key, values = {}) {
            return key.replace(/\{([^}]+)\}/g, (match, name) => values[name] ?? match);
        }
    });
    assert.equal(payload.title, "About Product", host);
    assert.equal(payload.version, "Version 1.2.3");
    assert.deepEqual(payload.body, ["A body"]);
    assert.equal(payload.copyright, "Copyright © 2020-2026, Author");

    assert.equal(clampMainZoomFactor(0.1), 0.5);
    assert.equal(clampMainZoomFactor(4), 3);
    assert.equal(clampMainZoomFactor(NaN), 1);
    assert.equal(nextMainZoomFactor("reset", 2), 1);
    assert.equal(nextMainZoomFactor("in", 3), 3);
    assert.equal(nextMainZoomFactor("out", 0.5), 0.5);
    for (const key of ["+", "=", "Add"]) {
        assert.equal(readMainZoomShortcut({ key, ctrlCmd: true }), "in");
    }
    for (const key of ["-", "_", "Subtract"]) {
        assert.equal(readMainZoomShortcut({ key, ctrlCmd: true }), "out");
    }
    assert.equal(readMainZoomShortcut({ code: "Numpad0", ctrlCmd: true }), "reset");
    assert.equal(readMainZoomShortcut({ key: "+", ctrlCmd: false }), null);
    assert.equal(readMainZoomShortcut({ key: "+", ctrlCmd: true, alt: true }), null);
    for (const [role, action] of [
        ["zoomIn", "in"], ["zoomOut", "out"], ["resetZoom", "reset"]
    ]) {
        assert.equal(readMainZoomMenuAction(role), action, host);
    }
    assert.equal(readMainZoomMenuAction("copy"), null, host);
}

const delivered = [];
const persisted = [];
const zoom = createMainWindowZoomController({
    defaultZoomFactor: 1,
    readStoredZoomFactor: () => 1,
    persistZoomFactor: (factor) => persisted.push(factor),
    listWindows: () => [{
        isDestroyed: () => false,
        webContents: {
            setZoomFactor: (factor) => delivered.push(factor),
            send() {}
        }
    }]
});
zoom.initialize();
const menu = createApplicationMenuTemplate({
    menu: [
        { id: "in", label: "Zoom In", role: "zoomIn" },
        { id: "out", label: "Zoom Out", role: "zoomOut" },
        { id: "reset", label: "Zoom Reset", role: "resetZoom" },
        { id: "copy", label: "Copy", role: "copy" }
    ]
}, (item) => assert.equal(zoom.handleMenuCommand(item), true));

assert.equal(menu[0].role, undefined, "native zoom must not bypass shared policy");
menu[0].click();
assert.equal(zoom.getZoomFactor(), 1.1);
menu[1].click();
assert.equal(zoom.getZoomFactor(), 1);
zoom.applyZoomFactor(2);
menu[2].click();
assert.equal(zoom.getZoomFactor(), 1);
assert.deepEqual(persisted, [1.1, 1, 1]);
assert.deepEqual(delivered, [1.1, 1, 2, 1]);
assert.equal(menu[3].role, "copy", "unrelated Electron mechanics remain native");
assert.equal(zoom.handleMenuCommand({ role: "copy" }), false);

console.log("Shared About and zoom policy cases passed; rendered host acceptance remains separate.");

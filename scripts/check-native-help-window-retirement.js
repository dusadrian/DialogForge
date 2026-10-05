"use strict";
const assert = require("node:assert/strict");
const {createHelpWindowController} = require("../dist/src/shell-electron/external/helpWindowController");
const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};};
(async () => {
    let current = true, shown = 0, ready, closed;
    let retirements = 0;
    const loading = deferred(), posting = deferred();
    const window = {
        isDestroyed: () => false,
        setTitle() {}, show() {shown++;}, focus() {},
        on(name, listener) {if (name === "closed") closed = listener;},
        once(name, listener) {if (name === "ready-to-show") ready = listener;},
        removeListener(name, listener) {if (ready === listener) ready = null;},
        loadURL: () => loading.promise,
        webContents: {getURL: () => "file:///help.html", on() {}, setWindowOpenHandler() {}, isLoading: () => false,
            executeJavaScript: () => posting.promise}
    };
    const controller = createHelpWindowController({
        createWindow: () => window, showOnOpen: true,
        onClose: () => {retirements++;}
    });
    const load = controller.load("file:///help.html", "R Help", () => current);
    current = false; ready(); loading.resolve(); await load;
    assert.equal(ready, null, "Completed loads release their readiness listener");
    assert.equal(shown, 0, "Retired help load must not reveal its window");
    current = true;
    const open = controller.openEntry({type: "help"}, "R Help", () => current);
    current = false; posting.resolve();
    assert.equal(await open, false);
    assert.equal(shown, 0, "Retired entry delivery must not reveal its window");
    current = true;
    assert.equal(await controller.openEntry({type: "help"}, "R Help", () => current), true);
    assert.equal(shown, 1, "Current entry reveals its owning window");
    const early = deferred();
    let pageUrl = "file:///previous.html";
    window.loadURL = () => early.promise;
    window.webContents.getURL = () => pageUrl;
    const earlyLoad = controller.load("file:///help.html", "R Help", () => current);
    ready();
    assert.equal(shown, 1, "Readiness from a previous document must not reveal the new request");
    pageUrl = "file:///help.html"; ready();
    assert.equal(shown, 2, "Current first paint may show before resource loading finishes");
    current = false; early.resolve(); await earlyLoad;
    assert.equal(shown, 2, "Later retirement must prevent another reveal");
    assert.equal(ready, null);
    closed();
    assert.equal(controller.getWindow(), null);
    assert.equal(retirements, 1, "Closing the owning window retires pending help requests");
    console.log("Native help early readiness, load, and entry retirement verified.");
})().catch(error => {console.error(error); process.exitCode = 1;});

"use strict";

const assert = require("node:assert/strict");
const {
    createConsoleCoverController
} = require("../dist/src/console/renderer/consoleCoverController");

const checkHost = async function(host) {
    const classes = new Set();
    const attributes = {};
    const message = { textContent: "" };
    const progress = {
        style: { setProperty() {} },
        classList: { toggle: (key, value) => { attributes[key] = value; } },
        setAttribute: (key, value) => { attributes[key] = value; },
        removeAttribute: (key) => { delete attributes[key]; }
    };
    const cover = createConsoleCoverController({
        document: {
            getElementById: (id) => id === "consoleCoverMessage"
                ? message
                : host === "browser" ? progress : null,
            body: { classList: {
                toggle: (key, value) => {
                    if (value) {
                        classes.add(key);
                    }
                    else {
                        classes.delete(key);
                    }
                }
            } }
        }
    });
    cover.renderStatus("Starting runtime...", true);
    assert.equal(message.textContent, "Starting runtime...", host);
    const first = cover.beginProgressActivity("First");
    const second = cover.beginProgressActivity("Second");
    first.update("First updated", 30);
    cover.renderStatus("Ignored while active", false);
    assert.equal(message.textContent, "Second");
    second.end();
    assert.equal(message.textContent, "First updated");
    second.update("Retired");
    second.end();
    assert.equal(message.textContent, "First updated");
    first.end();
    assert.equal(cover.hasActivities(), false);
    assert.equal(classes.has("console-cover-visible"), false);
    await assert.rejects(cover.runActivity("Failing", async function() {
        throw new Error("expected activity failure");
    }), /expected activity failure/);
    assert.equal(cover.hasActivities(), false);
    assert.equal(classes.has("console-cover-visible"), false);
    const outer = cover.beginProgressActivity("Outer activity");
    let failInner;
    const failing = cover.runActivity("Inner activity", () => {
        return new Promise((_resolve, reject) => { failInner = reject; });
    });
    outer.update("Outer continues", 45);
    assert.equal(message.textContent, "Inner activity");
    failInner(new Error("inner activity failed"));
    await assert.rejects(failing, /inner activity failed/);
    assert.equal(message.textContent, "Outer continues");
    assert.equal(cover.hasActivities(), true);
    assert.equal(classes.has("console-cover-visible"), true);
    if (host === "browser") {
        assert.equal(attributes["aria-valuenow"], "45");
    }
    outer.end();
    const later = cover.beginProgressActivity("Later activity");
    outer.update("Retired outer", 90);
    outer.end();
    assert.equal(message.textContent, "Later activity",
        "Late cleanup of a failed overlap cannot retire its replacement.");
    later.end();
    assert.equal(cover.hasActivities(), false);
    assert.equal(classes.has("console-cover-visible"), false);
    cover.renderStatus("Ready", false);
    assert.equal(message.textContent, "Ready");
};

Promise.all([checkHost("electron"), checkHost("browser")]).then(function() {
    console.log("Shared console cover cases passed; rendered acceptance is separate.");
}).catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});

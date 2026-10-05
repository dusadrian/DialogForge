"use strict";

const assert = require("node:assert/strict");
const {
    createHelpViewerParameters,
    createHelpViewerOpenEntry
} = require("../dist/src/runtime/help/helpViewerDocument");
const {
    createRHelpTopicPresentation
} = require("../dist/src/runtime/providers/r/help/rHelpPresentation");
const {
    createHelpTopicResult
} = require("../dist/src/runtime/help/helpProtocol");


for (const host of ["native-window", "browser-frame"]) {
    const document = {
        title: "R Help",
        topic: "mean",
        packageName: "base",
        sourceUrl: "http://127.0.0.1:12345/library/base/html/mean.html",
        baseUrl: "http://127.0.0.1:12345/library/base/html/mean.html",
        html: "<p>Fallback body</p>",
        resourceBaseUrl: "http://127.0.0.1:12345/help-resource/owner/"
    };
    const parameters = createHelpViewerParameters(document);
    const entry = createHelpViewerOpenEntry(document);

    assert.equal(parameters.get("src"), document.sourceUrl, host);
    assert.equal(parameters.has("doc"), false, host);
    assert.equal(entry.url, parameters.get("src"), host);
    assert.equal(entry.baseUrl, parameters.get("base"), host);
    assert.equal(entry.resourceBaseUrl, parameters.get("resourceBase"), host);
    assert.equal(entry.topic, parameters.get("topic"), host);
    assert.equal(entry.packageName, parameters.get("package"), host);

    const chooser = {
        title: "R Help",
        topic: "Résumé",
        html: "<h1>Résumé — α</h1>"
    };
    const chooserParameters = createHelpViewerParameters(chooser);
    const chooserEntry = createHelpViewerOpenEntry(chooser);

    assert.equal(chooserParameters.has("src"), false, host);
    assert.equal(chooserEntry.url, "", host);
    assert.equal(
        Buffer.from(chooserParameters.get("doc"), "base64").toString("utf8"),
        chooserEntry.html,
        host
    );
    assert.equal(chooserEntry.resourceBaseUrl, "", host);
}

const page = createRHelpTopicPresentation(createHelpTopicResult({
    status: "ready",
    topic: "mean",
    path: "/library/base/html/mean.html",
    body: " <p>Preserve these bytes.</p> "
}), { topic: "mean" }, (path) => `http://localhost:12345${path}`);
assert.equal(page.available, true);
assert.equal(page.needsResources, true);
assert.equal(page.packageName, "base");
assert.equal(page.sourceUrl, "http://localhost:12345/library/base/html/mean.html");
assert.equal(page.html, " <p>Preserve these bytes.</p> ");

const chooser = createRHelpTopicPresentation(createHelpTopicResult({
    status: "ready",
    topic: "filter",
    matches: [{ topic: "filter", package: "stats", title: "Linear filter", path: "/library/stats/html/filter.html" }]
}), { topic: "filter" }, (path) => `http://localhost:12345${path}`);
assert.equal(chooser.available, true);
assert.equal(chooser.sourceUrl, "");
assert.match(chooser.html, /http:\/\/localhost:12345\/library\/stats\/html\/filter.html/);

const unavailable = createRHelpTopicPresentation(createHelpTopicResult({
    status: "failed",
    path: "/library/base/html/mean.html",
    body: "Unaccepted body"
}), { topic: "mean" });
assert.equal(unavailable.available, false);
assert.equal(unavailable.needsResources, false);
assert.equal(unavailable.path, "");
assert.equal(unavailable.html, "");

console.log("Shared help viewer entry cases passed.");

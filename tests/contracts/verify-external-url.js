"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { externalUrlApi } = require("../../shared/shell-electron/external/externalUrl");
assert.deepStrictEqual(externalUrlApi.createExternalUrlOpenRequest("http://127.0.0.1:1234/live"), {
    status: "ready",
    url: "http://127.0.0.1:1234/live",
    message: "Viewer URL is ready."
});
assert.deepStrictEqual(externalUrlApi.createExternalUrlOpenRequest("https://example.test/plot"), {
    status: "ready",
    url: "https://example.test/plot",
    message: "Viewer URL is ready."
});
assert.deepStrictEqual(externalUrlApi.createExternalUrlOpenRequest(""), {
    status: "invalid",
    url: "",
    message: "No viewer URL was provided."
});
assert.deepStrictEqual(externalUrlApi.createExternalUrlOpenRequest("not a url"), {
    status: "invalid",
    url: "not a url",
    message: "The viewer URL is not valid."
});
assert.deepStrictEqual(externalUrlApi.createExternalUrlOpenRequest("file:///tmp/plot.html"), {
    status: "invalid",
    url: "file:///tmp/plot.html",
    message: "Only http and https viewer URLs can be opened."
});
console.log("External URL guard verified.");

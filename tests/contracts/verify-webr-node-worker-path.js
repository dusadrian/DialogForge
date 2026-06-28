"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const assert = require("assert");

const {
    installWebRNodeWorkerPathNormalization,
    normalizeWebRNodeWorkerTarget
} = require("../../shared/runtime/providers/webr/webRNodeWorkerPath");


const fakePathToFileURL = function(value) {
    return {
        href: `file:///${String(value).replace(/\\/g, "/")}`
    };
};


const fileUrl = normalizeWebRNodeWorkerTarget(
    "file:///tmp/webr-worker.js",
    fakePathToFileURL
);

assert.ok(fileUrl instanceof URL);
assert.strictEqual(fileUrl.href, "file:///tmp/webr-worker.js");

const windowsPath = normalizeWebRNodeWorkerTarget(
    "C:\\app\\node_modules\\webr\\dist\\webr-worker.js",
    fakePathToFileURL
);

assert.deepStrictEqual(windowsPath, {
    href: "file:///C:/app/node_modules/webr/dist/webr-worker.js"
});

const windowsUrlLike = normalizeWebRNodeWorkerTarget(
    {
        protocol: "C:",
        href: "/C:/app/node_modules/webr/dist/webr-worker.js"
    },
    fakePathToFileURL
);

assert.strictEqual(
    windowsUrlLike,
    "C:/app/node_modules/webr/dist/webr-worker.js"
);

let receivedTarget = null;

class FakeWorker {
    constructor(target) {
        receivedTarget = target;
    }
}

const workerThreads = {
    Worker: FakeWorker
};
const globalTarget = {};
const installed = installWebRNodeWorkerPathNormalization({
    workerThreads,
    pathToFileURL: fakePathToFileURL,
    globalTarget
});

assert.strictEqual(installed, true);

new workerThreads.Worker("file:///tmp/webr-worker.js");

assert.ok(receivedTarget instanceof URL);
assert.strictEqual(globalTarget.Worker, workerThreads.Worker);

console.log("WebR Node Worker path normalization verified.");

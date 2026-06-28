"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const assert = require("assert");
const path = require("path");

const {
    resolveWebRAssetBase
} = require("../../shared/runtime/providers/webr/webRAssetBase");


const explicit = resolveWebRAssetBase({
    explicitBaseUrl: "/runtime/webr"
});

assert.strictEqual(explicit.source, "explicit");
assert.strictEqual(explicit.baseUrl, "/runtime/webr/");

const nodePackage = resolveWebRAssetBase({
    requireResolve: function(id) {
        assert.strictEqual(id, "webr");
        return path.join(
            "/workspace",
            "dist",
            "node_modules",
            "webr",
            "dist",
            "webr.cjs"
        );
    }
});

assert.strictEqual(nodePackage.source, "node-package");
assert.strictEqual(
    nodePackage.baseUrl,
    "/workspace/dist/node_modules/webr/dist/"
);

const windowsPackage = resolveWebRAssetBase({
    requireResolve: function() {
        return "C:\\app\\node_modules\\webr\\dist\\webr.cjs";
    }
});

assert.strictEqual(windowsPackage.source, "node-package");
assert.strictEqual(windowsPackage.baseUrl, "C:/app/node_modules/webr/dist/");

const unresolved = resolveWebRAssetBase({
    requireResolve: function() {
        throw new Error("missing package");
    }
});

assert.strictEqual(unresolved.source, "unresolved");
assert.strictEqual(unresolved.baseUrl, "");

console.log("WebR asset base resolution verified.");

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
    getRuntimeProvider,
    listRuntimeProviderIds
} = require("../../shared/runtime/providers/runtimeProviderRegistry");


const projectRoot = path.resolve(__dirname, "../..");
const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")
);
const packagedRuntimeDependencies = fs.readFileSync(
    path.join(projectRoot, "scripts/packagedRuntimeDependencies.js"),
    "utf8"
);
const runtimeBridgeSource = fs.readFileSync(
    path.join(projectRoot, "shared/runtime/providers/webr/webRRuntimeBridge.ts"),
    "utf8"
);
const ids = listRuntimeProviderIds();

assert.ok(ids.includes("server-r"));
assert.ok(ids.includes("webr"));
assert.ok(packageJson.dependencies.webr);
assert.ok(packagedRuntimeDependencies.includes('"webr"'));
assert.ok(runtimeBridgeSource.includes('from "webr"'));
assert.ok(runtimeBridgeSource.includes("new WebRClass"));

const serverR = getRuntimeProvider("server-r");
assert.strictEqual(serverR.manifest.id, "server-r");
assert.strictEqual(serverR.manifest.language, "r");
assert.strictEqual(serverR.manifest.status, "reserved");
assert.ok(serverR.manifest.capabilities.includes("workspace.objects"));
assert.ok(serverR.manifest.capabilities.includes("plots"));
assert.strictEqual(serverR.createSession().connection, "reserved");
assert.ok(serverR.readOnlyAdapter);

const serverObjects = serverR.readOnlyAdapter.listWorkspaceObjects("server-r");
assert.strictEqual(serverObjects[0].name, "server_sample_data");
assert.ok(serverObjects[0].capabilities.includes("tabular.read"));

const serverPreview = serverR.readOnlyAdapter.readTabularPreview(
    "server-r",
    "server_sample_data"
);
assert.strictEqual(serverPreview.status, "ready");
assert.strictEqual(serverPreview.rows.length, 2);

const webR = getRuntimeProvider("webr");
assert.strictEqual(webR.manifest.id, "webr");
assert.strictEqual(webR.manifest.language, "r");
assert.strictEqual(webR.manifest.status, "experimental");
assert.ok(webR.manifest.capabilities.includes("workspace.objects"));
assert.ok(webR.manifest.capabilities.includes("dependencies.packages"));
assert.ok(!webR.manifest.capabilities.includes("plots"));
assert.strictEqual(webR.createSession().connection, "disconnected");
assert.strictEqual(webR.manifest.policies.packages.installation, "unsupported");
assert.strictEqual(webR.manifest.policies.filesystem.access, "browser-virtual");
assert.ok(webR.readOnlyAdapter);

const webObjects = webR.readOnlyAdapter.listWorkspaceObjects("webr");
assert.strictEqual(webObjects[0].name, "webr_sample_data");
assert.ok(webObjects[0].capabilities.includes("tabular.read"));

const webPreview = webR.readOnlyAdapter.readTabularPreview(
    "webr",
    "webr_sample_data"
);
assert.strictEqual(webPreview.status, "ready");
assert.strictEqual(webPreview.rows[0].case, "A");

console.log("Web R runtime provider and package bridge verified.");

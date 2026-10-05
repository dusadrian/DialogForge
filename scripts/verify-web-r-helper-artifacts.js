"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const http = require("node:http");
const crypto = require("node:crypto");
const {
    readWebRHelperArtifacts,
    prepareWebRHelperArtifacts,
    bundleWebRHelperArtifacts,
    assertWebRHelperArtifacts,
    checkServedWebRHelperArtifacts
} = require("./web-r-helper-artifacts");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-helper-build-cases-"));
const writeFixture = function(relativePath, contents) {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
};
const names = ["dialogforgeruntime"];
const builders = ["build-r-runtime-helper.js"];
writeFixture("node_modules/webr/dist/webR/config.d.ts", 'export declare const R_VERSION = "4.6.0";');
writeFixture("node_modules/webr/package.json", '{"version":"0.6.0"}');
writeFixture("scripts/build-r-helper-webr.R", "# Shared WebR build fixture\n");
for (let index = 0; index < names.length; index += 1) {
    writeFixture(`src/runtime/providers/r/native/${names[index]}/DESCRIPTION`, "Version: 1.2.3\n");
    writeFixture(`src/runtime/providers/r/native/${names[index]}/src/helper.c`, "/* Canonical fixture */\n");
    writeFixture("scripts/" + builders[index], "// Builder fixture\n");
}

const calls = [];
const buildFixture = function(helper) {
    calls.push(helper.name);
    // This models only the external builder boundary. Real package installation
    // and rendered startup acceptance remain separate from these cache cases.
    writeFixture(path.join("dist", helper.relativePath), zlib.gzipSync("built " + helper.name));
    return { status: 0 };
};
const expectBuilds = function(expected) {
    calls.length = 0;
    if (expected.length > 0) {
        bundleWebRHelperArtifacts(root, buildFixture);
    }
    prepareWebRHelperArtifacts(root);
    assert.deepEqual(calls, expected);
    assertWebRHelperArtifacts(root, path.join(root, "dist"));
};

// A fresh deployment never invokes the builder, even when no prebuilt exists.
assert.throws(() => prepareWebRHelperArtifacts(root), /Prebuilt WebR helper is missing, stale or invalid/);
assert.deepEqual(calls, []);
expectBuilds(names);
expectBuilds([]);
writeFixture("src/runtime/providers/r/native/dialogforgeruntime/src/helper.c", "/* Changed canonical fixture */\n");
assert.throws(() => prepareWebRHelperArtifacts(root), /Prebuilt WebR helper is missing, stale or invalid/);
expectBuilds([names[0]]);
writeFixture("scripts/build-r-helper-webr.R", "# Changed shared builder\n");
assert.throws(() => prepareWebRHelperArtifacts(root), /Prebuilt WebR helper is missing, stale or invalid/);
expectBuilds(names);
writeFixture("scripts/build-r-runtime-helper.js", "// Changed helper builder\n");
assert.throws(() => prepareWebRHelperArtifacts(root), /Prebuilt WebR helper is missing, stale or invalid/);
expectBuilds(names);
const previousImage = process.env.DIALOGFORGE_WEBR_BUILD_IMAGE;
process.env.DIALOGFORGE_WEBR_BUILD_IMAGE = "fixture-toolchain:changed";
assert.throws(() => prepareWebRHelperArtifacts(root), /Prebuilt WebR helper is missing, stale or invalid/);
expectBuilds(names);
if (previousImage === undefined) {
    delete process.env.DIALOGFORGE_WEBR_BUILD_IMAGE;
} else {
    process.env.DIALOGFORGE_WEBR_BUILD_IMAGE = previousImage;
}
expectBuilds(names);

let artifacts = readWebRHelperArtifacts(root);
const firstArchive = path.join(root, "dist", artifacts[0].relativePath);
fs.writeFileSync(firstArchive, "corrupt gzip");
expectBuilds([]);
fs.writeFileSync(firstArchive + ".build.json", "null");
expectBuilds([]);
fs.writeFileSync(firstArchive + ".build.json", "{invalid json");
expectBuilds([]);
fs.writeFileSync(firstArchive, zlib.gzipSync("different valid gzip bytes"));
expectBuilds([]);
// A self-consistent generated receipt still cannot replace the supplied pin.
const alternateArchive = zlib.gzipSync("self-consistent but unpinned payload");
const alternateReceipt = JSON.parse(fs.readFileSync(firstArchive + ".build.json", "utf8"));
alternateReceipt.archiveSha256 = crypto.createHash("sha256").update(alternateArchive).digest("hex");
fs.writeFileSync(firstArchive, alternateArchive);
fs.writeFileSync(firstArchive + ".build.json", JSON.stringify(alternateReceipt));
assert.throws(() => assertWebRHelperArtifacts(root, path.join(root, "dist")), /missing, stale or invalid/);
expectBuilds([]);
fs.unlinkSync(firstArchive + ".build.json");
expectBuilds([]);

// A valid dist cache must not hide a broken supplied bundle. Missing or changed
// bundle bytes fail closed without using a compiler or changing the cache.
const suppliedArchive = path.join(root, "vendor", artifacts[0].relativePath);
const suppliedBytes = fs.readFileSync(suppliedArchive);
const suppliedReceipt = fs.readFileSync(suppliedArchive + ".build.json");
for (const invalid of ["corrupt gzip", zlib.gzipSync("wrong prebuilt bytes")]) {
    fs.writeFileSync(suppliedArchive, invalid);
    assert.throws(() => prepareWebRHelperArtifacts(root), /Prebuilt WebR helper is missing, stale or invalid/);
    assert.deepEqual(fs.readFileSync(firstArchive), suppliedBytes);
}
fs.unlinkSync(suppliedArchive);
assert.throws(() => prepareWebRHelperArtifacts(root), /Prebuilt WebR helper is missing, stale or invalid/);
fs.writeFileSync(suppliedArchive, suppliedBytes);
for (const invalid of ["null", "{invalid json", "{}"]) {
    fs.writeFileSync(suppliedArchive + ".build.json", invalid);
    assert.throws(() => prepareWebRHelperArtifacts(root), /Prebuilt WebR helper is missing, stale or invalid/);
}
fs.unlinkSync(suppliedArchive + ".build.json");
assert.throws(() => prepareWebRHelperArtifacts(root), /Prebuilt WebR helper is missing, stale or invalid/);
fs.writeFileSync(suppliedArchive + ".build.json", suppliedReceipt);
expectBuilds([]);
fs.unlinkSync(firstArchive);
expectBuilds([]);
writeFixture("node_modules/webr/package.json", '{"version":"0.6.1"}');
assert.throws(() => prepareWebRHelperArtifacts(root), /Prebuilt WebR helper is missing, stale or invalid/);
expectBuilds(names);

writeFixture("src/runtime/providers/r/native/dialogforgeruntime/src/helper.c", "/* Another source revision */\n");
assert.throws(() => bundleWebRHelperArtifacts(root, () => ({ status: 1 })), /Cannot build dialogforgeruntime/);
assert.throws(() => assertWebRHelperArtifacts(root, path.join(root, "dist")), /missing, stale or invalid/);
assert.throws(() => prepareWebRHelperArtifacts(root), /Prebuilt WebR helper is missing, stale or invalid/);
expectBuilds([names[0]]);

// A stale expected archive cannot satisfy a successful build that emits no
// replacement, including a builder using the wrong R-version output directory.
writeFixture("src/runtime/providers/r/native/dialogforgeruntime/src/helper.c", "/* Wrong target fixture */\n");
assert.throws(() => bundleWebRHelperArtifacts(root, helper => {
    writeFixture(path.join("dist", helper.directory, "webr/4.5.0", helper.name + "_1.2.3.tgz"), zlib.gzipSync("wrong target"));
    return { status: 0 };
}), /did not produce a valid helper/);
expectBuilds([names[0]]);

writeFixture("node_modules/webr/dist/webR/config.d.ts", 'export declare const R_VERSION = "4.7.0";');
assert.throws(() => prepareWebRHelperArtifacts(root), /Prebuilt WebR helper is missing, stale or invalid/);
expectBuilds(names);
writeFixture("src/runtime/providers/r/native/dialogforgeruntime/DESCRIPTION", "Version: 1.3.0\n");
assert.throws(() => prepareWebRHelperArtifacts(root), /Prebuilt WebR helper is missing, stale or invalid/);
expectBuilds([names[0]]);
artifacts = readWebRHelperArtifacts(root);
assert.ok(artifacts.every(helper => helper.runtimeVersion === "4.7.0"));
assert.equal(artifacts[0].packageVersion, "1.3.0");
const alternateOutput = path.join(root, "product-web");
for (const helper of artifacts) {
    for (const suffix of ["", ".build.json"]) {
        const relativePath = helper.relativePath + suffix;
        writeFixture(path.join("product-web", relativePath), fs.readFileSync(path.join(root, "dist", relativePath)));
    }
}
assertWebRHelperArtifacts(root, alternateOutput);
fs.unlinkSync(path.join(alternateOutput, artifacts[0].relativePath));
assert.throws(() => assertWebRHelperArtifacts(root, alternateOutput), /missing, stale or invalid/);

const buildSource = fs.readFileSync(path.join(__dirname, "build-web.js"), "utf8");
assert.ok(buildSource.indexOf('"scripts/web-r-helper-artifacts.js"') < buildSource.indexOf('run("tsc"'));
const copySource = fs.readFileSync(path.join(__dirname, "copy-static.js"), "utf8");
assert.match(copySource, /if \(includeWebRuntime\)\s*\{\s*assertWebRHelperArtifacts/);
console.log("WebR helper preparation cases passed; rendered startup remains a separate acceptance requirement.");
console.log("Retained temporary fixtures: " + root);

const checkDeploymentEndpoints = async function() {
    const helper = artifacts[0];
    const archive = fs.readFileSync(path.join(root, "dist", helper.relativePath));
    let status = 200;
    let body = archive;
    const requests = [];
    const server = http.createServer(function(request, response) {
        requests.push(request.url);
        response.writeHead(status);
        response.end(body);
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const url = "http://127.0.0.1:" + server.address().port;
    try {
        await checkServedWebRHelperArtifacts(root, path.join(root, "dist"), url);
        assert.equal(requests[0], "/" + helper.relativePath.split(path.sep).join("/"));
        status = 404;
        await assert.rejects(checkServedWebRHelperArtifacts(root, path.join(root, "dist"), url), /HTTP 404/);
        status = 200;
        body = zlib.gzipSync("wrong deployed package");
        await assert.rejects(checkServedWebRHelperArtifacts(root, path.join(root, "dist"), url), /differs from/);
        const count = requests.length;
        fs.unlinkSync(path.join(root, "dist", helper.relativePath + ".build.json"));
        await assert.rejects(checkServedWebRHelperArtifacts(root, path.join(root, "dist"), url), /missing, stale or invalid/);
        assert.equal(requests.length, count, "Reject invalid staged output before checking any server");
        console.log("Deployment endpoint cases passed: matching bytes, HTTP404, wrong bytes and stale local output.");
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
};

checkDeploymentEndpoints().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});

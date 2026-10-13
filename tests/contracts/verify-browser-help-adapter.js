"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const rootDir = process.cwd();
const browserHelpAdapterPath = path.join(rootDir, "src/shell-web/browserHelpAdapter.ts");
const helpDocumentEncoding = fs.readFileSync(
    path.join(rootDir, "src/runtime/help/helpDocumentEncoding.ts"),
    "utf8"
);
const helpCommandUrl = fs.readFileSync(
    path.join(rootDir, "src/runtime/help/helpCommandUrl.ts"),
    "utf8"
);
const rHelpDocument = fs.readFileSync(
    path.join(rootDir, "src/runtime/help/rHelpDocument.ts"),
    "utf8"
);
const dialogRBrowserHost = fs.readFileSync(
    path.join(rootDir, "src/shell-web/pages/shell.js"),
    "utf8"
);
const webRHelpDocument = fs.readFileSync(
    path.join(rootDir, "src/runtime/providers/webr/webRHelpDocument.ts"),
    "utf8"
);
const shellWebTsconfig = fs.readFileSync(
    path.join(rootDir, "tsconfig.shell-web.json"),
    "utf8"
);

assert.ok(
    !fs.existsSync(browserHelpAdapterPath)
        && helpDocumentEncoding.includes("encodeHelpDocumentHtml")
        && !helpDocumentEncoding.includes("parseBrowserHelpTopicFromUrl")
        && !helpDocumentEncoding.includes("buildBrowserHelpExampleCommand")
        && !helpDocumentEncoding.includes("createBrowserHelpFallbackHtml"),
    "help document encoding must live in shared runtime help, not a browser-only adapter"
);
assert.ok(
    helpCommandUrl.includes("buildHelpExampleCommand")
        && rHelpDocument.includes("parseRHelpTopicFromUrl")
        && rHelpDocument.includes("parseRHelpHttpdPath")
        && rHelpDocument.includes("createRHelpFallbackHtml"),
    "shared help modules must own R help URL parsing, fallback HTML, and example command construction"
);
assert.ok(
    dialogRBrowserHost.includes("createWebRHelpPageReader")
        && webRHelpDocument.includes("parseRHelpTopicFromUrl(raw, origin)")
        && webRHelpDocument.includes("parseRHelpHttpdPath(raw, origin)")
        && dialogRBrowserHost.includes("prepareRHelpDocumentWithoutResources")
        && dialogRBrowserHost.includes("createRHelpTopicPresentation")
        && dialogRBrowserHost.includes("createHelpCommandActions({")
        && !dialogRBrowserHost.includes("const buildHelpExampleCommand = function"),
    "DialogR browser host must delegate help policy to shared R and WebR help modules"
);
assert.ok(
    !shellWebTsconfig.includes("src/shell-web/browserHelpAdapter.ts")
        && shellWebTsconfig.includes("src/runtime/help/helpDocumentEncoding.ts")
        && shellWebTsconfig.includes("src/runtime/help/helpCommandUrl.ts")
        && shellWebTsconfig.includes("src/runtime/help/rHelpDocument.ts"),
    "browser ESM build must include shared help encoding and shared help modules"
);

console.log("Browser help adapter verified.");

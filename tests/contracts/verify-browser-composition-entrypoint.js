"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const assert = require("assert");
const fs = require("fs");
const path = require("path");


const projectRoot = path.resolve(__dirname, "../..");
const browserComposition = fs.readFileSync(
    path.join(projectRoot, "shared/shell-web/browserComposition.ts"),
    "utf8"
);
const browserHostAdapter = fs.readFileSync(
    path.join(projectRoot, "shared/shell-web/browserHostAdapter.ts"),
    "utf8"
);


assert.ok(browserComposition.includes("composeBrowserApplication"));
assert.ok(browserComposition.includes('hostKind: "web"'));
assert.ok(browserComposition.includes("resolveProductLocation"));
assert.ok(browserComposition.includes("composeApplication"));
assert.ok(browserComposition.includes("createBrowserHostAdapter"));
assert.ok(!browserComposition.includes("electron"));

assert.ok(browserHostAdapter.includes("createBrowserResourceClient"));
assert.ok(browserHostAdapter.includes("navigator.clipboard"));
assert.ok(browserHostAdapter.includes("window.open"));
assert.ok(!browserHostAdapter.includes("electron"));

console.log("Browser composition entrypoint contract verified.");

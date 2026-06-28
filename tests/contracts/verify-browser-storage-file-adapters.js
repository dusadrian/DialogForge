"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const assert = require("assert");
const fs = require("fs");
const path = require("path");


const projectRoot = path.resolve(__dirname, "../..");
const storageAdapter = fs.readFileSync(
    path.join(projectRoot, "shared/shell-web/browserStorageAdapter.ts"),
    "utf8"
);
const fileAdapter = fs.readFileSync(
    path.join(projectRoot, "shared/shell-web/browserFileAdapter.ts"),
    "utf8"
);
const hostAdapter = fs.readFileSync(
    path.join(projectRoot, "shared/shell-web/browserHostAdapter.ts"),
    "utf8"
);
const composition = fs.readFileSync(
    path.join(projectRoot, "shared/shell-web/browserComposition.ts"),
    "utf8"
);


assert.ok(storageAdapter.includes("createBrowserStorageAdapter"));
assert.ok(storageAdapter.includes("readSettings"));
assert.ok(storageAdapter.includes("writeSettings"));
assert.ok(storageAdapter.includes("readWorkspaceState"));
assert.ok(storageAdapter.includes("writeWorkspaceState"));
assert.ok(storageAdapter.includes("window.localStorage"));

assert.ok(fileAdapter.includes("BrowserFileReference"));
assert.ok(fileAdapter.includes("selectFiles"));
assert.ok(fileAdapter.includes('input.type = "file"'));
assert.ok(fileAdapter.includes("download"));
assert.ok(fileAdapter.includes("URL.createObjectURL"));

assert.ok(hostAdapter.includes("createBrowserFileAdapter"));
assert.ok(hostAdapter.includes("files.selectFiles"));
assert.ok(composition.includes("fileAdapter"));
assert.ok(composition.includes("storageAdapter"));

console.log("Browser storage and file adapter contracts verified.");

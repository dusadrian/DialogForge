"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const assert = require("assert");
const fs = require("fs");
const path = require("path");


const projectRoot = path.resolve(__dirname, "../..");
const surface = fs.readFileSync(
    path.join(projectRoot, "shared/shell-web/browserDialogSurface.ts"),
    "utf8"
);
const composition = fs.readFileSync(
    path.join(projectRoot, "shared/shell-web/browserComposition.ts"),
    "utf8"
);
const dialogBuilder = fs.readFileSync(
    path.join(projectRoot, "shared/base-app/pages/dialogBuilder.html"),
    "utf8"
);


assert.ok(dialogBuilder.includes('id="paper"'));
assert.ok(dialogBuilder.includes('id="dialogQuickActions"'));
assert.ok(dialogBuilder.includes("dialogBuilder.css"));
assert.ok(dialogBuilder.includes("appCodicon.css"));

assert.ok(surface.includes("createBrowserDialogSurfaceController"));
assert.ok(surface.includes("dialogforge-web-dialog-layer"));
assert.ok(surface.includes("dialogforge-web-dialog__frame"));
assert.ok(surface.includes("dialogBuilder.html"));
assert.ok(surface.includes('role", "dialog"'));
assert.ok(surface.includes('aria-modal", "true"'));
assert.ok(!surface.includes("electron"));

assert.ok(composition.includes("dialogSurfaceController"));
assert.ok(composition.includes("createBrowserDialogSurfaceController"));

console.log("Browser dialog surface contract verified.");
